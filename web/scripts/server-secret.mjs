// Creates (or rotates with --rotate) SKIHOST_SERVER_SECRET: the shared secret that lets only the
// SkiHost server count downloads, apply per-IP rate limits and store A2A tasks. The plaintext goes
// into web/.env.local (copy it to your hosting provider's env vars); the database keeps only its hash.
// Usage: npm run server-secret [-- --rotate]
import { createHash, randomBytes } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const here = dirname(fileURLToPath(import.meta.url));
const envFile = join(here, "..", ".env.local");
let env = existsSync(envFile) ? readFileSync(envFile, "utf8") : "";
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim().replace(/^["']|["']$/g, "");

const url = process.env.DATABASE_URL || get("DATABASE_URL");
if (!url) {
  console.error("DATABASE_URL is not set in web/.env.local");
  process.exit(1);
}

let secret = get("SKIHOST_SERVER_SECRET");
const rotate = process.argv.includes("--rotate");
if (!secret || rotate) {
  secret = randomBytes(32).toString("base64url");
  if (get("SKIHOST_SERVER_SECRET") !== undefined) {
    env = env.replace(/^SKIHOST_SERVER_SECRET=.*$/m, `SKIHOST_SERVER_SECRET=${secret}`);
    writeFileSync(envFile, env);
  } else {
    appendFileSync(envFile, `\n# Server-only secret (also set it in your hosting env vars). Never expose it to browsers.\nSKIHOST_SERVER_SECRET=${secret}\n`);
  }
}

const sql = postgres(url, { ssl: "require", max: 1, onnotice: () => {} });
try {
  const hash = createHash("sha256").update(secret).digest("hex");
  await sql`insert into public.server_secrets (id, secret_hash, updated_at) values (1, ${hash}, now())
            on conflict (id) do update set secret_hash = excluded.secret_hash, updated_at = now()`;
  console.log(`✓ server secret ${rotate ? "rotated" : "registered"}; value is SKIHOST_SERVER_SECRET in web/.env.local`);
  console.log("  Add the same value to your hosting environment variables (e.g. Vercel → Settings → Environment Variables).");
} catch (err) {
  console.error("Failed:", err.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
