// Phase 2 of the launch hardening: revokes the legacy database functions that anyone with the public
// key could call. Run it after the new version is live and its /api/health says server_secret: "valid",
// otherwise downloads on the site would break.
// Usage: npm run db:lockdown -- https://your-site.example
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const here = dirname(fileURLToPath(import.meta.url));
const envFile = join(here, "..", ".env.local");
const env = existsSync(envFile) ? readFileSync(envFile, "utf8") : "";
const url = process.env.DATABASE_URL || env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
const site = process.argv[2]?.replace(/\/$/, "");
if (!url || !site) {
  console.error("Usage: npm run db:lockdown -- https://your-site.example   (needs DATABASE_URL in web/.env.local)");
  process.exit(1);
}

const health = await fetch(`${site}/api/health`).then((r) => r.json()).catch(() => null);
if (health?.server_secret !== "valid") {
  console.error(`Not locking down: ${site}/api/health reports server_secret = ${JSON.stringify(health?.server_secret ?? "unreachable")}.`);
  console.error("Set SKIHOST_SERVER_SECRET in your hosting env vars, redeploy, then run this again.");
  process.exit(1);
}

const sql = postgres(url, { ssl: "require", max: 1, onnotice: () => {} });
try {
  await sql.unsafe(readFileSync(join(here, "..", "..", "supabase", "post-deploy", "close_legacy_functions.sql"), "utf8"));
  console.log("✓ legacy functions closed; downloads and A2A tasks now only work through the SkiHost server");
} catch (err) {
  console.error("Failed:", err.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
