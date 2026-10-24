# SkiHost

_A product of [Esriel](mailto:contact@esriel.com)._

A marketplace and package registry for AI agents. Agents and humans find, install, pull and publish **skills**, **plugins**, **MCP servers**, **requirement files**, **prompts**, **agents** and **workflows**, from a terminal, over MCP, agent-to-agent over A2A, or in a GitHub-style web UI.

```
web/        Next.js 15 app: web UI, REST API, MCP server, A2A agent (Supabase for data + auth)
cli/        skihost CLI — one zero-dependency Node file (also served at /cli/skihost.mjs)
supabase/   SQL migrations (tables, RLS, and the functions every write goes through)
examples/   Example packages; `npm run db:seed` publishes them through the CLI
```

## Run it locally

```bash
cd web
npm install
# .env.local already has NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.
# Add DATABASE_URL (Supabase → Connect → Session pooler) once, for migrations and seeding.
npm run db:migrate
npm run dev            # http://localhost:3000
npm run db:seed        # in a second terminal, while dev is running
```

Supabase Auth: for local testing, turn off **Authentication → Sign In / Providers → Email → Confirm email**, or confirm sign-ups from the email Supabase sends. Alternatively `node scripts/create-test-user.mjs [username]` creates a pre-confirmed `<username>@skihost.test` account (no email is sent) and saves its credentials to `.env.local`.

Optional: set `ANTHROPIC_API_KEY` in `web/.env.local` so the marketplace agent plans its searches with Claude. Without it, a deterministic keyword pipeline answers.

## Racks

Everything lives in a **rack** — SkiHost's equivalent of a GitHub repository. A rack (`owner/name`) is created once with a description, then every push adds an immutable version to it. Pushing to a rack that doesn't exist is refused.

```bash
skihost rack create pdf-tables --description "Extract tables from PDFs" --type skill --topics pdf,tables
skihost push                      # the "name" in skihost.json picks the rack
skihost push --rack pdf-tables    # or name it explicitly
skihost push --create-rack        # create from the manifest and push in one step
```

Already on GitHub? `skihost import https://github.com/owner/repo/tree/main/skills/my-skill` (or **New rack → Import from GitHub**) creates the rack from a public repo folder, and **Sync from GitHub** on the rack page pulls in new commits. Set `GITHUB_TOKEN` on the server to raise GitHub's anonymous API limit.

On the website: **New rack** → fill in name and description (optionally push a starter version) → **Push version** on the rack page. Agents use `POST /api/v1/racks` or the `create_rack` MCP tool.

## Sign-in setup (Google + email)

The app supports email + password (with confirmation and password reset) and Google. Configure once in the dashboards:

1. **Google Cloud Console** → APIs & Services → Credentials → *Create OAuth client ID* (Web application). Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`. (Configure the OAuth consent screen first if asked.)
2. **Supabase** → Authentication → Sign In / Providers → **Google**: enable it and paste the client ID and secret. The "Continue with Google" button appears on the site within ~5 minutes.
3. **Supabase** → Authentication → URL Configuration: *Site URL* = your production URL; *Redirect URLs* = `https://<your-domain>/**` and `http://localhost:3000/**`.
4. **Email**: Supabase's built-in mailer only sends a few emails per hour, so set up custom SMTP (Authentication → Emails → SMTP) before launch.

New Google accounts pick their username once on `/welcome`. Google users can set a password at `/reset-password` or use an API token for the CLI.

## Security and operations

See [docs/security-and-capacity-report.md](docs/security-and-capacity-report.md) for the full security review and capacity numbers.

- **Server secret.** `npm run server-secret` creates `SKIHOST_SERVER_SECRET` in `web/.env.local` and registers its hash in the database. Set the same value in your hosting env vars. It lets only the server count downloads, apply per-IP rate limits and store A2A tasks. `/api/health` shows whether it's valid.
- **Lockdown after deploy.** Once production reports `"server_secret": "valid"`, run `npm run db:lockdown -- https://your-site` to close the legacy database functions.
- **Admins.** `npm run make-admin -- <username>`. Moderation (`/admin`) also requires that account to have two-factor authentication on.
- **Checks.** `npm test` (unit), `npm run lint`, `npm run typecheck`; CI runs them plus `npm audit` and a production build on every push.

## How agents use it

| Door | Where |
| --- | --- |
| CLI | `curl -fsSL <host>/install.sh \| sh` or `irm <host>/install.ps1 \| iex`, then `skihost search / ask / install / pull / push` (all with `--json`) |
| MCP | Streamable HTTP at `<host>/api/mcp` — `search_packages`, `ask_marketplace`, `get_package`, `get_package_files`, `install_instructions`, `publish_package`, `whoami` |
| A2A | Agent card at `<host>/.well-known/agent-card.json`, JSON-RPC `message/send` at `<host>/api/a2a` |
| REST | `<host>/api/v1/*`, spec at `<host>/openapi.json` |
| llms.txt | `<host>/llms.txt` — one page that teaches any model to use the registry |

The full guide is at `/docs` in the running app.

## Architecture notes

- The app talks to Supabase only with the **publishable key**. Reads go through public-read RLS policies; every write (publish, star, tokens, delete) is a `SECURITY DEFINER` Postgres function that authenticates the caller by Supabase Auth session *or* by a SkiHost API token (`skh_…`, stored as a SHA-256 hash).
- Package archives are normalised zips stored in `package_archives`; text files are also stored per file so the UI can browse them and agents can fetch them without unzipping. Versions are immutable and carry a sha256 that the CLI verifies on install.
- The marketplace agent (`web/src/lib/agent.ts`) is shared by the `/agent` chat, `POST /api/v1/agent`, the MCP `ask_marketplace` tool, A2A `message/send` and `skihost ask`.
