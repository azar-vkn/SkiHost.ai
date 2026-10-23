// Seeds the registry with the example packages in ../examples by publishing them through the
// real CLI against a running SkiHost server, so seeding doubles as an end-to-end check.
// Usage: npm run db:seed [-- --registry http://localhost:3000]
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const here = dirname(fileURLToPath(import.meta.url));
loadEnv(join(here, "..", ".env.local"));
const registry = (process.argv.find((a, i) => process.argv[i - 1] === "--registry") ?? "http://localhost:3000").replace(/\/$/, "");
const cli = join(here, "..", "..", "cli", "skihost.mjs");
const examples = join(here, "..", "..", "examples");

const NAMESPACES = {
  skihost: { display_name: "SkiHost", bio: "Official example packages maintained by the SkiHost team." },
  "agent-labs": { display_name: "Agent Labs", bio: "Community skills and plugins for coding and research agents." },
};
// Older releases published first so packages show a version history.
const HISTORY = { "skihost/pdf-tables": ["1.0.0", "1.1.0"], "agent-labs/web-research": ["1.3.0"] };

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set in web/.env.local");
  process.exit(1);
}
const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1, onnotice: () => {} });

const tokens = [];
try {
  for (const ns of readdirSync(examples).filter((d) => statSync(join(examples, d)).isDirectory())) {
    const meta = NAMESPACES[ns] ?? { display_name: ns, bio: null };
    const [profile] = await sql`
      insert into public.profiles (username, display_name, bio)
      values (${ns}, ${meta.display_name}, ${meta.bio})
      on conflict (username) do update set display_name = excluded.display_name, bio = excluded.bio
      returning id`;
    const token = "skh_seed_" + randomBytes(24).toString("hex");
    const [row] = await sql`
      insert into public.api_tokens (profile_id, name, token_hash, prefix)
      values (${profile.id}, 'seed', ${createHash("sha256").update(token).digest("hex")}, ${token.slice(0, 12)})
      returning id`;
    tokens.push(row.id);

    for (const pkg of readdirSync(join(examples, ns))) {
      const dir = join(examples, ns, pkg);
      const versions = [...(HISTORY[`${ns}/${pkg}`] ?? []), null];
      for (const version of versions) {
        const args = [cli, "push", dir, "--json", "--create-rack", ...(version ? ["--version", version] : [])];
        try {
          const out = JSON.parse(execFileSync(process.execPath, args, { env: { ...process.env, SKIHOST_TOKEN: token, SKIHOST_REGISTRY: registry }, encoding: "utf8" }));
          console.log(`✓ ${out.id}@${out.version} (${out.files} files)`);
        } catch (err) {
          const msg = parseError(err);
          if (/already published/i.test(msg)) console.log(`· ${ns}/${pkg}${version ? "@" + version : ""} already published`);
          else throw new Error(`${ns}/${pkg}: ${msg}`);
        }
      }
    }
  }
  console.log(`Seeded ${registry}`);
} catch (err) {
  console.error("Seed failed:", err.message);
  process.exitCode = 1;
} finally {
  if (tokens.length) await sql`update public.api_tokens set revoked_at = now() where id = any(${tokens})`;
  await sql.end();
}

function parseError(err) {
  try {
    return JSON.parse(err.stdout).error.message;
  } catch {
    return err.stderr?.toString() || err.message;
  }
}

function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
