// Grants (or with --revoke removes) the admin role, which unlocks /admin: reports, disabling racks,
// suspending accounts. Run it for your own username after signing up.
// Usage: npm run make-admin -- <username> [--revoke]
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const here = dirname(fileURLToPath(import.meta.url));
const envFile = join(here, "..", ".env.local");
const env = existsSync(envFile) ? readFileSync(envFile, "utf8") : "";
const url = process.env.DATABASE_URL || env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
const username = process.argv.slice(2).find((a) => !a.startsWith("--"));
const revoke = process.argv.includes("--revoke");
if (!url || !username) {
  console.error("Usage: npm run make-admin -- <username> [--revoke]   (needs DATABASE_URL in web/.env.local)");
  process.exit(1);
}

const sql = postgres(url, { ssl: "require", max: 1, onnotice: () => {} });
try {
  const rows = await sql`update public.profiles set role = ${revoke ? "user" : "admin"} where username = ${username} returning username, role`;
  if (!rows.length) throw new Error(`No user named "${username}"`);
  console.log(`✓ ${rows[0].username} is now ${rows[0].role === "admin" ? "an admin" : "a regular user"}`);
} catch (err) {
  console.error("Failed:", err.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
