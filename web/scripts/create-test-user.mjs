// Creates a confirmed Supabase Auth user for local end-to-end testing (no confirmation email is sent),
// and records its credentials as TEST_USER_EMAIL / TEST_USER_PASSWORD in web/.env.local.
// Usage: node scripts/create-test-user.mjs [username]
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const here = dirname(fileURLToPath(import.meta.url));
const envFile = join(here, "..", ".env.local");
const env = existsSync(envFile) ? readFileSync(envFile, "utf8") : "";
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim().replace(/^["']|["']$/g, "");

const url = process.env.DATABASE_URL || get("DATABASE_URL");
if (!url) throw new Error("DATABASE_URL is not set");
if (get("TEST_USER_EMAIL")) {
  console.log(`Test user already recorded in .env.local (${get("TEST_USER_EMAIL")})`);
  process.exit(0);
}

const username = process.argv[2] ?? "e2e-tester";
const email = `${username}@skihost.test`;
const password = randomBytes(12).toString("base64url");
const sql = postgres(url, { ssl: "require", max: 1, onnotice: () => {} });
try {
  await sql.begin(async (tx) => {
    const [user] = await tx`
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                              raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                              confirmation_token, email_change, email_change_token_new, recovery_token)
      values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', ${email},
              extensions.crypt(${password}, extensions.gen_salt('bf')), now(),
              '{"provider":"email","providers":["email"]}', ${sql.json({ username, display_name: "E2E Tester" })},
              now(), now(), '', '', '', '')
      returning id`;
    await tx`
      insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), ${user.id}, ${user.id}::text,
              ${sql.json({ sub: user.id, email, email_verified: true })}, 'email', now(), now(), now())`;
  });
  appendFileSync(envFile, `\n# Local E2E test account (created by scripts/create-test-user.mjs)\nTEST_USER_EMAIL=${email}\nTEST_USER_PASSWORD=${password}\n`);
  console.log(`Created confirmed test user ${email} (username ${username}); credentials saved to .env.local`);
} finally {
  await sql.end();
}
