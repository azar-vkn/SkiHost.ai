// Bulk-imports a curated list of openly licensed agent skills and MCP servers from GitHub into the
// `mirror` namespace, through the real /api/v1/import endpoint of a running SkiHost server, so every
// rack records its source repo, folder and pinned commit exactly like a user import would.
//
// Usage: npm run import:github [-- --registry http://localhost:3000] [--only 5] [--dry-run]
//
// Re-running is safe: racks that already exist are skipped. GitHub's API allows 60 requests/hour
// without a token and each import uses two, so the script waits for GitHub's reset when it runs low
// rather than importing without license/commit details. Set GITHUB_TOKEN (in web/.env.local and the
// server's environment) to import at full speed.
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const here = dirname(fileURLToPath(import.meta.url));
loadEnv(join(here, "..", ".env.local"));
const arg = (name) => process.argv.find((a, i) => process.argv[i - 1] === name);
const registry = (arg("--registry") ?? "http://localhost:3000").replace(/\/$/, "");
const only = Number(arg("--only") ?? Infinity);
const dryRun = process.argv.includes("--dry-run");

const NAMESPACE = {
  username: "mirror",
  display_name: "Open Source Mirror",
  bio: "Openly licensed agent skills and MCP servers imported from public GitHub repositories. Each rack links to its original repository and pinned commit; all credit goes to the original authors.",
};

// [repo, folder, rack name, { type, description }]. Only folders whose license allows redistribution:
// anthropics/skills folders each carry Apache-2.0 (the proprietary document skills are excluded).
const SKILLS = [
  ...[
    "algorithmic-art", "canvas-design", "claude-api", "frontend-design", "internal-comms", "mcp-builder",
    "skill-creator", "slack-gif-creator", "theme-factory", "web-artifacts-builder", "webapp-testing",
  ].map((s) => ["anthropics/skills", `skills/${s}`, s]),
  ...[
    "brainstorming", "dispatching-parallel-agents", "executing-plans", "finishing-a-development-branch",
    "receiving-code-review", "requesting-code-review", "subagent-driven-development", "systematic-debugging",
    "test-driven-development", "using-git-worktrees", "verification-before-completion", "writing-plans", "writing-skills",
  ].map((s) => ["obra/superpowers", `skills/${s}`, s]),
  ...[
    "api-and-interface-design", "browser-testing-with-devtools", "ci-cd-and-automation", "code-review-and-quality",
    "code-simplification", "context-engineering", "debugging-and-error-recovery", "deprecation-and-migration",
    "documentation-and-adrs", "frontend-ui-engineering", "git-workflow-and-versioning", "idea-refine",
    "incremental-implementation", "interview-me", "observability-and-instrumentation", "performance-optimization",
    "planning-and-task-breakdown", "security-and-hardening", "shipping-and-launch", "spec-driven-development",
  ].map((s) => ["addyosmani/agent-skills", `skills/${s}`, s]),
  ...[
    "advanced-evaluation", "context-compression", "context-degradation", "context-fundamentals", "context-optimization",
    "evaluation", "filesystem-context", "hosted-agents", "long-horizon-prompting", "memory-systems",
    "multi-agent-patterns", "tool-design",
  ].map((s) => ["muratcankoylan/Agent-Skills-for-Context-Engineering", `skills/${s}`, s === "evaluation" ? "agent-evaluation" : s]),
  ...[
    "hf-cli", "hf-mem", "huggingface-datasets", "huggingface-gradio", "huggingface-llm-trainer", "huggingface-local-models",
    "huggingface-papers", "huggingface-spaces", "transformers-js", "trl-training",
  ].map((s) => ["huggingface/skills", `skills/${s}`, s]),
  ...[
    ["static-analysis", "semgrep"], ["static-analysis", "codeql"], ["static-analysis", "sarif-parsing"],
    ["differential-review", "differential-review"], ["supply-chain-risk-auditor", "supply-chain-risk-auditor"],
    ["property-based-testing", "property-based-testing"], ["modern-python", "modern-python"],
    ["devcontainer-setup", "devcontainer-setup"], ["variant-analysis", "variant-analysis"], ["fp-check", "fp-check"],
    ["sharp-edges", "sharp-edges"], ["audit-context-building", "audit-context-building"],
    ["semgrep-rule-creator", "semgrep-rule-creator"], ["agentic-actions-auditor", "agentic-actions-auditor"], ["c-review", "c-review"],
  ].map(([plugin, s]) => ["trailofbits/skills", `plugins/${plugin}/skills/${s}`, s]),
  ...[
    "gcloud", "bigquery-basics", "bigquery-optimization", "bigquery-troubleshooting", "cloud-run-basics", "cloud-sql-basics",
    "cloud-logging-query-generation", "gemini-api", "gke-basics", "gke-manifest-generation", "gke-cost-optimization",
  ].map((s) => ["google/skills", `skills/cloud/${s}`, s === "gcloud" ? "google-cloud-gcloud" : s]),
  ["google/skills", "skills/analytics/google-analytics-data-api-basics", "google-analytics-data-api-basics"],
];

const MCP_SERVERS = {
  everything: "Reference MCP server that exercises every protocol feature (tools, resources, prompts, sampling) for testing MCP clients.",
  fetch: "MCP server that fetches web pages and converts them to markdown so an agent can read online content.",
  filesystem: "MCP server for secure file operations (read, write, search, move) limited to the directories you allow.",
  git: "MCP server for reading, searching and changing Git repositories: status, diff, log, commit, branch.",
  memory: "MCP server that gives an agent persistent memory as a local knowledge graph of entities and relations.",
  sequentialthinking: "MCP server for dynamic, reflective problem-solving through a structured sequence of thoughts.",
  time: "MCP server for current time and timezone conversions using IANA timezone names.",
};
const ENTRIES = [
  ...SKILLS.map(([repo, path, name]) => ({ repo, path, name, type: "skill" })),
  ...Object.entries(MCP_SERVERS).map(([s, description]) => ({
    repo: "modelcontextprotocol/servers",
    path: `src/${s}`,
    name: `mcp-server-${s}`,
    type: "mcp-server",
    description,
  })),
].slice(0, only);

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set in web/.env.local");
  process.exit(1);
}
const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1, connect_timeout: 60, onnotice: () => {} });
const ghHeaders = { "User-Agent": "skihost-bulk-import", ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let tokenId = null;
const results = { imported: [], skipped: [], failed: [] };
try {
  const [profile] = await sql`
    insert into public.profiles (username, display_name, bio)
    values (${NAMESPACE.username}, ${NAMESPACE.display_name}, ${NAMESPACE.bio})
    on conflict (username) do update set display_name = excluded.display_name, bio = excluded.bio
    returning id`;
  const token = "skh_mirror_" + randomBytes(24).toString("hex");
  [{ id: tokenId }] = await sql`
    insert into public.api_tokens (profile_id, name, token_hash, prefix, expires_at)
    values (${profile.id}, 'bulk github import', ${createHash("sha256").update(token).digest("hex")}, ${token.slice(0, 12)}, now() + interval '1 day')
    returning id`;

  console.log(`Importing ${ENTRIES.length} racks into ${registry}/${NAMESPACE.username}${dryRun ? " (dry run)" : ""}`);
  for (const [i, e] of ENTRIES.entries()) {
    const label = `[${i + 1}/${ENTRIES.length}] ${NAMESPACE.username}/${e.name} ← ${e.repo}/${e.path}`;
    const exists = await fetch(`${registry}/api/v1/packages/${NAMESPACE.username}/${e.name}`).then((r) => r.ok).catch(() => false);
    if (exists) {
      console.log(`· ${label} (already imported)`);
      results.skipped.push(e.name);
      continue;
    }
    if (dryRun) {
      console.log(`○ ${label}`);
      continue;
    }

    await waitForGitHub();
    // This is a one-off admin seed through the public endpoint: reset this account's own import/publish
    // counters so the per-account hourly quotas meant for people don't stop it. Other users' limits are untouched.
    await sql`delete from public.rate_limits where key like ${"actor:" + profile.id + ":%"} or key like 'ip:import:%'`;

    let outcome;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(`${registry}/api/v1/import`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            url: `https://github.com/${e.repo}`,
            path: e.path,
            name: e.name,
            type: e.type,
            ...(e.description ? { description: e.description } : {}),
            confirm_rights: true,
          }),
          signal: AbortSignal.timeout(10 * 60_000),
        });
        const body = await res.json().catch(() => ({}));
        outcome = res.ok ? { ok: true, body } : { ok: false, status: res.status, message: body.error?.message ?? res.statusText };
        // Network trouble and GitHub hiccups are worth a retry; validation errors aren't.
        if (outcome.ok || ![429, 500, 502, 503, 504].includes(res.status)) break;
      } catch (err) {
        outcome = { ok: false, status: 0, message: err.message };
      }
      if (attempt < 3) await sleep(15_000 * attempt);
    }

    if (outcome.ok) {
      const b = outcome.body;
      console.log(`✓ ${label} → v${b.version}, ${b.files} files${b.source?.commit ? ` @ ${b.source.commit.slice(0, 7)}` : " (no commit pin)"}`);
      results.imported.push(e.name);
    } else {
      console.log(`✗ ${label}: ${outcome.status} ${outcome.message}`);
      results.failed.push({ name: e.name, error: `${outcome.status} ${outcome.message}` });
    }
  }
} catch (err) {
  console.error("Import stopped:", err.message);
  process.exitCode = 1;
} finally {
  if (tokenId) await sql`update public.api_tokens set revoked_at = now() where id = ${tokenId}`;
  await sql.end();
  console.log(`\nImported ${results.imported.length}, already there ${results.skipped.length}, failed ${results.failed.length}`);
  for (const f of results.failed) console.log(`  ✗ ${f.name}: ${f.error}`);
}

/** Each import makes 2 GitHub API calls (repo details, commit). Wait for the hourly reset instead of importing without them. */
async function waitForGitHub() {
  for (;;) {
    try {
      const { resources } = await (await fetch("https://api.github.com/rate_limit", { headers: ghHeaders })).json();
      if (resources.core.remaining >= 4) return;
      const wait = resources.core.reset * 1000 - Date.now() + 5_000;
      console.log(`  GitHub API allowance used up; waiting ${Math.ceil(wait / 60_000)} min for it to reset`);
      await sleep(Math.max(wait, 10_000));
    } catch {
      await sleep(30_000);
    }
  }
}

function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
