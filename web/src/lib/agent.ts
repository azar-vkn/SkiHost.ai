import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPackage, searchPackages, type PackageSummary } from "./registry";
import { installInfo } from "./install";
import { PACKAGE_TYPES } from "./package-format";

/**
 * The SkiHost marketplace agent: the "seller" side that buyer agents (and humans in the
 * /agent chat) talk to over REST, MCP, A2A or `skihost ask`. It turns a natural-language
 * need into ranked packages with exact install commands. Claude plans and explains when
 * ANTHROPIC_API_KEY is set; otherwise a deterministic search pipeline answers.
 */

export interface AgentPackage extends PackageSummary {
  id: string;
  url: string;
  install: string;
}

export interface AgentResult {
  intent: "search" | "install" | "publish" | "help";
  reply: string;
  packages: AgentPackage[];
  engine: "claude" | "search";
}

const STOPWORDS = new Set(
  (
    "a an the i me my we our you your it its is are be to of in on for with and or that this these those can could " +
    "would should will do does need needs want wants looking look find search get give show any some skill skills " +
    "package packages agent agents ai please help build make create using use which what something thing tool tools " +
    "from into about like just also have has able so then there here how best good install download marketplace skihost"
  ).split(" "),
);

const TYPE_HINTS: [RegExp, string][] = [
  [/\bmcp\b|model context protocol/i, "mcp-server"],
  [/\bplugins?\b/i, "plugin"],
  [/\brequirements?\b|\bdependenc(y|ies)\b|requirements\.txt/i, "requirements"],
  [/\bprompts?\b/i, "prompt"],
  [/\bworkflows?\b/i, "workflow"],
];

export async function runMarketplaceAgent(db: SupabaseClient, base: string, message: string): Promise<AgentResult> {
  const text = message.trim().slice(0, 2000);
  if (!text) return helpResult(base);
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return await runWithClaude(db, base, text);
    } catch (err) {
      console.error("Marketplace agent: Claude unavailable, falling back to search", err);
    }
  }
  return runWithSearch(db, base, text);
}

// ───────────────────────── deterministic pipeline ─────────────────────────

async function runWithSearch(db: SupabaseClient, base: string, text: string): Promise<AgentResult> {
  // An explicit `owner/name` means the caller already knows what it wants.
  for (const m of text.matchAll(/(?:^|[\s`'"(])([a-z0-9][a-z0-9-]{0,38})\/([a-z0-9][a-z0-9._-]{0,63})(?:@(\d+\.\d+\.\d+[\w.-]*))?/gi)) {
    const pkg = await getPackage(db, m[1].toLowerCase(), m[2].toLowerCase());
    if (!pkg) continue;
    const version = m[3] ?? pkg.latest_version;
    const manifest = pkg.versions.find((v) => v.version === version)?.manifest;
    const info = installInfo(base, pkg.owner, pkg.name, version, manifest);
    const lines = [
      `**${pkg.owner}/${pkg.name}@${version}** — ${pkg.description}`,
      "",
      "Install it with the CLI:",
      "```bash",
      info.cli_pinned,
      "```",
      `For Claude Code use \`${info.claude_code}\` (installs into \`${info.claude_path}\`).`,
      `No CLI? Download the zip: ${info.download_url}`,
      ...(info.requirements.length ? ["", "Then install its requirements:", "```bash", ...info.requirements, "```"] : []),
    ];
    return { intent: "install", reply: lines.join("\n"), packages: [toAgentPackage(pkg, base)], engine: "search" };
  }

  if (/\b(publish|push|upload|share|release)\b/i.test(text) && !/\b(find|search|need|looking)\b/i.test(text)) {
    return publishResult(base);
  }

  const type = TYPE_HINTS.find(([re]) => re.test(text))?.[1] ?? null;
  const terms = [...new Set(text.toLowerCase().split(/[^a-z0-9.+#-]+/))].filter(
    (w) => w.length > 1 && !STOPWORDS.has(w) && !PACKAGE_TYPES.includes(w as never),
  );
  const query = terms.join(" ");

  let found = await searchPackages(db, { q: query || null, type, limit: 6 });
  let relaxed = false;
  if (found.results.length === 0 && type) {
    found = await searchPackages(db, { q: query || null, limit: 6 });
    relaxed = true;
  }
  // The search ORs every keyword, so weak partial matches trail behind; keep those near the best one.
  const best = found.ranks[0] ?? 0;
  const results = query ? found.results.filter((_, i) => found.ranks[i] >= best * 0.3) : found.results;
  const packages = results.map((p) => toAgentPackage(p, base));

  if (packages.length === 0) {
    return {
      intent: "search",
      engine: "search",
      packages: [],
      reply: [
        `I couldn't find a package matching **${query || text}** yet.`,
        "",
        "- Try broader keywords, or browse " + `${base}/explore`,
        "- Or build it and publish it for every other agent: `skihost init && skihost push`",
      ].join("\n"),
    };
  }

  const top = packages[0];
  const lines = [
    query
      ? `Found ${packages.length} package${packages.length > 1 ? "s" : ""} for **${query}**${type && !relaxed ? ` (type: ${type})` : ""}:`
      : "Here are the most popular packages:",
    "",
    ...packages.map(
      (p, i) =>
        `${i + 1}. **${p.id}** \`${p.type}\` v${p.latest_version} — ${p.description} _(↓${p.downloads}, ★${p.stars})_`,
    ),
    "",
    `Best match: **${top.id}**. Install it with:`,
    "```bash",
    top.install,
    "```",
  ];
  return { intent: "search", reply: lines.join("\n"), packages, engine: "search" };
}

function toAgentPackage(p: PackageSummary, base: string): AgentPackage {
  return {
    owner: p.owner,
    name: p.name,
    type: p.type,
    description: p.description,
    keywords: p.keywords,
    agents: p.agents,
    category: p.category,
    latest_version: p.latest_version,
    downloads: p.downloads,
    stars: p.stars,
    updated_at: p.updated_at,
    created_at: p.created_at,
    id: `${p.owner}/${p.name}`,
    url: `${base}/${p.owner}/${p.name}`,
    install: `skihost install ${p.owner}/${p.name}`,
  };
}

function publishResult(base: string): AgentResult {
  return {
    intent: "publish",
    engine: "search",
    packages: [],
    reply: [
      "Everything on SkiHost lives in a rack (like a GitHub repository). Create one, then push into it:",
      "",
      "```bash",
      "skihost login            # once; or set SKIHOST_TOKEN",
      "skihost rack create my-skill --description \"what it does\"   # once, like creating a repo",
      "skihost init --name my-skill --type skill   # writes skihost.json + SKILL.md",
      "skihost push                                 # pushes a version into the rack",
      "```",
      `Agents without the CLI create the rack with \`POST ${base}/api/v1/racks\`, then POST JSON to \`${base}/api/v1/publish\` with \`Authorization: Bearer <token>\` and a body of \`{ "manifest": {...}, "files": { "SKILL.md": "..." } }\`.`,
      `Humans can create a rack at ${base}/new and upload files from its page.`,
    ].join("\n"),
  };
}

function helpResult(base: string): AgentResult {
  return {
    intent: "help",
    engine: "search",
    packages: [],
    reply: `Tell me what your agent needs to do (for example "parse invoices from PDFs" or "an MCP server for Postgres") and I'll find the right package and the exact install command. Docs: ${base}/docs`,
  };
}

// ───────────────────────── Claude-planned pipeline ─────────────────────────

const SYSTEM_PROMPT = `You are the SkiHost marketplace agent. SkiHost is a registry of skills, plugins, MCP servers, requirement files, prompts and workflows that AI agents and humans install with the \`skihost\` CLI.

Other AI agents (buyers) and humans describe a task; your job is to find the packages that best fit it in the registry, using the search_registry and get_package tools, and answer with what to install.

How to answer:
- Search with a few focused keyword queries rather than the user's whole sentence; try synonyms if the first search is thin.
- Only recommend packages the tools returned. Never invent package names, versions or features.
- Lead with the single best match and its exact install command (\`skihost install owner/name\`), then up to four alternatives with one line each on when to prefer them.
- Mention requirements (pip/npm packages, env vars) from get_package when they matter for using the package.
- If nothing fits, say so plainly and suggest publishing one with \`skihost init\` and \`skihost push\`.
- Keep the answer short and in Markdown; the reader may be another agent parsing it.`;

const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "search_registry",
    description:
      "Full-text search over SkiHost packages (names, keywords, descriptions, READMEs). Returns up to 8 packages ranked by relevance with downloads and stars.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: { type: "string", description: "A few focused keywords, e.g. 'pdf table extraction'" },
        type: {
          type: "string",
          enum: ["any", ...PACKAGE_TYPES],
          description: "Restrict to one package type, or 'any'",
        },
      },
      required: ["query", "type"],
    },
  },
  {
    name: "get_package",
    description:
      "Full details for one package: description, README excerpt, versions, requirements and install commands.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        owner: { type: "string" },
        name: { type: "string" },
      },
      required: ["owner", "name"],
    },
  },
];

async function runWithClaude(db: SupabaseClient, base: string, text: string): Promise<AgentResult> {
  const client = new Anthropic();
  const seen = new Map<string, AgentPackage>();
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: text }];

  for (let turn = 0; turn < 6; turn++) {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    });

    if (response.stop_reason === "refusal") throw new Error("Claude declined the request");

    if (response.stop_reason !== "tool_use") {
      const reply = response.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      const mentioned = [...seen.values()].filter((p) => reply.includes(p.id));
      return {
        intent: "search",
        engine: "claude",
        reply,
        packages: (mentioned.length ? mentioned : [...seen.values()]).slice(0, 6),
      };
    }

    messages.push({ role: "assistant", content: response.content });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      try {
        const output = await runTool(db, base, block.name, block.input as Record<string, string>, seen);
        results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(output) });
      } catch (err) {
        results.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: err instanceof Error ? err.message : "Tool failed",
          is_error: true,
        });
      }
    }
    messages.push({ role: "user", content: results });
  }
  throw new Error("Marketplace agent did not finish within its turn limit");
}

async function runTool(
  db: SupabaseClient,
  base: string,
  name: string,
  input: Record<string, string>,
  seen: Map<string, AgentPackage>,
) {
  if (name === "search_registry") {
    const { results } = await searchPackages(db, {
      q: input.query,
      type: input.type && input.type !== "any" ? input.type : null,
      limit: 8,
    });
    return results.map((p) => {
      const ap = toAgentPackage(p, base);
      seen.set(ap.id, ap);
      return {
        id: ap.id,
        type: p.type,
        version: p.latest_version,
        description: p.description,
        keywords: p.keywords,
        downloads: p.downloads,
        stars: p.stars,
      };
    });
  }
  if (name === "get_package") {
    const pkg = await getPackage(db, input.owner, input.name);
    if (!pkg) return { error: `No package ${input.owner}/${input.name}` };
    if (!pkg.latest_version) return { error: `${input.owner}/${input.name} is an empty rack: nothing has been pushed to it yet` };
    const ap = toAgentPackage(pkg, base);
    seen.set(ap.id, ap);
    const manifest = pkg.versions.find((v) => v.version === pkg.latest_version)?.manifest;
    return {
      id: ap.id,
      type: pkg.type,
      description: pkg.description,
      versions: pkg.versions.map((v) => v.version),
      requirements: manifest?.requirements ?? null,
      install: installInfo(base, pkg.owner, pkg.name, pkg.latest_version!, manifest),
      readme_excerpt: (pkg.readme ?? "").slice(0, 3000),
    };
  }
  throw new Error(`Unknown tool ${name}`);
}
