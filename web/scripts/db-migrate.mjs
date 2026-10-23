// Applies ../supabase/migrations/*.sql to DATABASE_URL in order, recording what ran.
// Usage: npm run db:migrate   (reads web/.env.local)
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const here = dirname(fileURLToPath(import.meta.url));
loadEnv(join(here, "..", ".env.local"));

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Add it to web/.env.local (Supabase → Connect → Session pooler).");
  process.exit(1);
}

const dir = join(here, "..", "..", "supabase", "migrations");
const sql = postgres(url, { ssl: "require", max: 1, onnotice: () => {} });

try {
  await sql`create table if not exists public._skihost_migrations (name text primary key, applied_at timestamptz default now())`;
  const done = new Set((await sql`select name from public._skihost_migrations`).map((r) => r.name));
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(file)) {
      console.log(`✓ ${file} (already applied)`);
      continue;
    }
    await sql.begin(async (tx) => {
      await tx.unsafe(readFileSync(join(dir, file), "utf8"));
      await tx`insert into public._skihost_migrations (name) values (${file})`;
    });
    console.log(`✓ ${file}`);
  }
  await sql`alter table public._skihost_migrations enable row level security`;
  await sql`notify pgrst, 'reload schema'`;
} catch (err) {
  console.error("Migration failed:", err.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}

function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
