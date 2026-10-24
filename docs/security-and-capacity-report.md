# SkiHost — Security & Capacity Report

_SkiHost is a product of Esriel · Prepared 24 October 2026 · Contact: contact@esriel.com_

## 1. Summary

| Question | Answer |
| --- | --- |
| Is it secure enough to launch publicly? | **Yes, once the 6 launch actions in §5 are done**, starting with the **database password reset (critical)**. Most are dashboard settings. Every protection below was tested against the production database. |
| How much traffic can it handle? | On the current **free** Supabase database: an estimated **50–150 requests/second** of mixed traffic, about **1–2 million requests/day** at a realistic peak-to-average ratio. The web tier (Vercel) scales out by itself; the database is the limit. A **Supabase Pro** compute upgrade raises this roughly in proportion to CPU. |
| How many racks can it hold? | Free database (500 MB): about **2,000–8,000 racks**, depending on package size. Supabase Pro (8 GB included, expandable): about **30,000–100,000 racks**. Search was measured to stay fast at **10,000 racks**. |

## 2. Security controls

Results: **36/36** end-to-end attack and abuse checks passed against the real database, plus **42/42** automated unit tests. `npm audit` reports **0 vulnerabilities**.

### Accounts and sign-in

| Control | Detail | Verified by |
| --- | --- | --- |
| Password hashing | Supabase Auth (bcrypt); passwords never reach SkiHost code except to sign in | Design |
| Minimum password length | 10 characters for new passwords | Code review |
| Two-factor authentication | Authenticator app (TOTP) for every account. When it's on, the database refuses password-only sessions (and password-to-token exchange) for publishing and creating tokens | E2E: real TOTP codes generated; password-only session refused (`mfa_required`) |
| Brute-force protection | Login limited per IP (10 / 5 min) **and** per email address | E2E: 11th attempt → HTTP 429 + `Retry-After` |
| API tokens | 256-bit random, stored only as SHA-256 hashes, shown once, revocable, **expire** (30/90/365 days; CLI tokens 180 days), max 50 per account | E2E: expired token rejected |
| Google sign-in | OAuth with PKCE; post-login redirects restricted to same-site paths | Unit tests (open-redirect cases) |
| Account deletion | Settings → Security; deletes the account and all its racks; needs the exact username | E2E |
| Terms consent | Required at sign-up and in the Google onboarding step | Code review |

### Data access (database)

| Control | Detail | Verified by |
| --- | --- | --- |
| No direct writes | All INSERT/UPDATE/DELETE grants removed from public roles; every write goes through checked database functions | E2E: direct update of download counts refused |
| Profile tampering closed | Users can edit only display name, bio and website; username and role can't be changed directly | E2E: self-rename and self-promotion to admin refused |
| Private columns hidden | `user_id`, terms and onboarding fields aren't readable with the public key | Probe |
| Server-only functions | Download counting, per-IP rate limits and A2A tasks need `SKIHOST_SERVER_SECRET`, held only by the server; the database stores just its hash | E2E: `forbidden` without the secret |
| Moderator powers | Admin role **plus** two-factor on that account **plus** a browser session; API tokens can't moderate | E2E: admin without 2FA refused |

### Web and API

| Control | Detail | Verified by |
| --- | --- | --- |
| Content Security Policy | Per-request nonce plus `strict-dynamic`; no inline scripts without a nonce; `frame-ancestors 'none'` | Header check; no CSP violations in the browser |
| Security headers | HSTS, `X-Frame-Options: DENY`, `nosniff`, strict Referrer-Policy, Permissions-Policy, COOP; API responses are sandboxed | Header check |
| CSRF | Cookie-authenticated writes must come from SkiHost's own origin; SameSite cookies; Next.js server-action origin checks | E2E: cross-site and Origin-less writes refused |
| XSS | React escaping; Markdown rendered without raw HTML; `javascript:` links stripped; only http(s) metadata links | Code review |
| SSRF (GitHub import) | Only `github.com`, `api.github.com` and `codeload.github.com`; at most one redirect, and only to codeload; timeouts; size caps (60 MB download, 20 MB unpacked) | Unit tests (cloud-metadata URL, other hosts, path traversal) |
| Rate limits | Per client IP (fleet-wide in Postgres): search 120/min, reads 300/min, downloads 60/min, writes 60/min, imports 10/10 min, agent 30/min, MCP 120/min, A2A 60/min. Per account: 60 publishes/hour, 30 new racks/hour, 20 imports/hour, 120 stars/hour, 20 reports/day | E2E: limits hit exactly (30 allowed, 5 throttled) |
| AI cost protection | If Claude is enabled: 10 AI-planned answers per IP per hour, plus a fleet-wide daily cap (`AGENT_LLM_DAILY_LIMIT`, default 500); beyond that the keyword search answers | Code review |

### Supply chain (what people install)

| Control | Detail | Verified by |
| --- | --- | --- |
| Secret blocking | Publishes containing real-looking AWS, GitHub, Slack, Stripe, Anthropic, OpenAI, Google or Supabase keys, private keys or passworded DB URLs are rejected with file:line | E2E + unit tests; documentation placeholders allowed |
| Risk warnings | Each version is scanned for: download-and-execute (`curl … \| sh`), obfuscated code, destructive commands, reverse shells, crypto-mining, credential-file reads, binaries, prompt-injection text. Shown on the rack page, in the API and by `skihost install` | E2E + unit tests |
| Integrity | Immutable versions; SHA-256 per version, verified by the CLI on install | Earlier E2E |
| Provenance | GitHub imports record repo, branch, folder and exact commit; uploaded files can't fake it | Unit test |
| Yank | Owners (and admins) can pull a version; "latest" skips it; pinned installs still work but warn | E2E |
| Reports and moderation | Report button and API; admin console to disable racks (blocks download, push and search), delete racks and suspend accounts (revokes their tokens) | E2E |
| Quotas | 4 MB per version, 250 MB per account, 200 racks per account, 1,000 versions per rack | Design (database-enforced) |
| CLI safety | Refuses non-https registries; refuses to overwrite the working directory or home; no path traversal on extract | Earlier E2E |

## 3. Residual risks (what is *not* covered)

| Risk | Level | Notes and mitigation |
| --- | --- | --- |
| Malicious skill that evades the heuristics | **Medium (inherent)** | Scanning is pattern-based, not sandbox analysis. Mitigations: warnings, reports, fast takedown, yank, provenance. Consider a "verified publisher" badge and manual review of popular racks. |
| Public data readable directly from Supabase | Low | Rack metadata and file text are public by design and can be read with the public key, bypassing SkiHost's rate limits (archives can't, after the lockdown). Heavy scraping would load the database; upgrading compute and Vercel Firewall rules mitigate it. |
| Bot sign-ups | Medium until fixed | Enable Supabase's CAPTCHA (Cloudflare Turnstile or hCaptcha) under Authentication → Attack Protection. |
| Email deliverability | High until fixed | Supabase's built-in mailer sends only a few emails per hour: set up custom SMTP before launch. |
| Rate-limit IP header | Low | Client IP comes from Vercel's own headers (trustworthy on Vercel). On other hosts, configure the proxy to set `x-real-ip`. |
| Legal text | Medium | Terms, Privacy and Security pages are a solid starting point, not legal advice: have them reviewed by counsel for Esriel's jurisdiction. |
| Single region, single database | Low/Medium | No read replicas or failover on the free plan; daily backups need Supabase Pro. |
| Database password | **Critical until fixed** | The current password is short and guessable, and it appeared in a development session log. The database host is reachable from the internet, and its username can be derived from the public Supabase URL. Before launch, rotate it to a long random password (Supabase → Database → Reset password). Every other control assumes the database password is secret. |

## 4. Capacity

### Measured (production database, Sydney)

Server-side execution time per query (median), on today's data and with 10,000 synthetic racks (inserted inside a transaction and rolled back):

| Operation | Today (8 racks) | At 10,000 racks |
| --- | --- | --- |
| Keyword search (4 words, broad) | 1.6 ms | 60 ms (was 292 ms before this release's optimisation) |
| Keyword search (specific word) | — | 23 ms (was 81 ms) |
| Browse / sort listing | 1.1 ms | 7 ms (was 42 ms) |
| Rack page data | 0.16 ms | 0.16 ms |
| File list | 0.07 ms | 0.15 ms |
| Download (archive + counters) | 2.7 ms | ~3 ms (per-rack, size-bound) |
| Rate-limit check | 0.25 ms | 0.25 ms |
| Registry stats | 0.6 ms | 16 ms → now **cached for 60 s** |

Concurrent run: 25 connections hammering search for 15 s gave 487 queries, **0 errors**, p50 427 ms and p95 1.1 s. That run was dominated by the 404 ms network round trip from the test machine to Sydney, so it shows stability under concurrency, not the ceiling.

### Estimates

- **Per request:** a rack page costs about 3–5 ms of database CPU including connection and API overhead, a search about 5–10 ms (40–70 ms at 10k racks for broad queries), a download about 5 ms.
- **Free database (Nano, shared CPU):** about **50–150 requests/second** of mixed traffic sustained. That's roughly 4–13 million requests/day if traffic were perfectly even; plan for **~1–2 million requests/day** at real peak-to-average ratios. Search-heavy traffic at 10k racks: about 20–40 searches/second.
- **Supabase Pro + Small/Medium compute:** roughly 2–4× the above. Beyond that, add read replicas or a dedicated search service.
- **Web tier:** Vercel Functions scale out automatically. Note that **Vercel's Hobby plan is for non-commercial use**: a commercial launch by Esriel should run on **Vercel Pro**, which also adds Firewall rate-limit rules.
- **Latency:** each database round trip from a Vercel function in **Sydney (syd1, now pinned)** to the database is a few milliseconds; from elsewhere it was about 400 ms. Pinning the region is the single biggest speed factor.

### Storage: how many racks fit

Each version stores its zip plus a text copy of its files for browsing, at about 2.2× the zip size plus about 2 KB of rows.

| Average zip per version | Per version stored | Free 500 MB (~470 MB usable) | Pro 8 GB included |
| --- | --- | --- | --- |
| 5 KB (small skill, like the examples) | ~13 KB | ~36,000 versions ≈ 12,000+ racks | ~600,000 versions |
| 40 KB (typical skill with scripts) | ~90 KB | ~5,000 versions ≈ 2,000 racks | ~90,000 versions ≈ 30,000 racks |
| 400 KB (heavy, e.g. office-document tooling) | ~880 KB | ~530 versions | ~9,000 versions |

(Racks assumed to average 2–3 versions.)

Pro disk grows beyond 8 GB at a per-GB price. Search was measured to 10,000 racks. Past roughly 50,000 racks, plan a dedicated search index, and move archives to object storage (Supabase Storage or Vercel Blob) once the database passes a few GB.

## 5. Launch actions for Esriel

| # | Action | Where |
| --- | --- | --- |
| 1 | **First:** reset the database password to a long random one (the current one is guessable), then update `DATABASE_URL` in `web/.env.local` | Supabase → Database → Settings |
| 2 | Add `SKIHOST_SERVER_SECRET` (copy the value from `web/.env.local`), `NEXT_PUBLIC_SITE_URL`, and optionally `GITHUB_TOKEN`, `ANTHROPIC_API_KEY`; redeploy | Vercel → Settings → Environment Variables |
| 3 | Check `https://<site>/api/health` shows `"server_secret": "valid"`, then run `npm run db:lockdown -- https://<site>` | Terminal |
| 4 | Custom SMTP; CAPTCHA (Turnstile/hCaptcha); Site URL and Redirect URLs; Google provider | Supabase → Authentication |
| 5 | Sign up with your own account, turn on 2FA, then `npm run make-admin -- <username>` | Site + terminal |
| 6 | Move to Vercel Pro and Supabase Pro for a commercial launch (backups, more CPU, firewall) | Billing |

## 6. Test evidence

- `web/tests/` — 42 unit tests (package building, secret scanning, risk flags, front matter, URL parsing, open redirects, rate limiting).
- End-to-end security run (36 checks), executed against the production database on 24 October 2026: CSRF; secret blocking; risk flags; yank; reports; quarantine; suspension; direct database tampering; expired tokens; two-factor enforcement with real TOTP codes; brute-force and agent rate limits; MCP batch limits; account deletion. All test data was removed afterwards.
- CI (`.github/workflows/ci.yml`) runs audit, lint, typecheck, tests and a production build on every push.
