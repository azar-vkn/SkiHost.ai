import type { Metadata } from "next";
import { Markdown } from "@/components/markdown";
import { contactLine, LEGAL_UPDATED } from "@/lib/legal";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <Markdown source={privacy()} />
    </article>
  );
}

function privacy() {
  return `# Privacy Policy

_Last updated: ${LEGAL_UPDATED}_

SkiHost is a product of **Esriel**, which is responsible for the personal data described here. SkiHost collects as little as it needs to run a public package registry.

## What we collect

| Data | Why | Kept |
| --- | --- | --- |
| Email address, username, display name, and (for Google sign-in) your Google name and profile photo URL | Your account and sign-in | Until you delete your account |
| Password | Sign-in. Stored only as a salted hash by our authentication provider | Until changed or account deleted |
| Two-factor secret | Authenticator-app sign-in | Until you turn it off |
| API tokens | Stored only as SHA-256 hashes; the token itself is shown to you once | Until revoked or account deleted |
| Racks, versions, stars and reports you create | The service itself (racks and stars are public) | Until you delete them or your account |
| IP addresses | Rate limiting and abuse prevention | Rate-limit counters expire within 24 hours |
| Download counts | Public, aggregate statistics; not linked to who downloaded | Indefinitely |

We don't sell data, show ads, or use third-party tracking or analytics cookies. The only cookies are the ones that keep you signed in, plus a local preference for light or dark theme.

## Service providers

- **Supabase** — database and authentication.
- **Vercel** — hosting and request logs.
- **Google** — only if you choose "Continue with Google".
- **GitHub** — only when you import a repository; we fetch public repository data from GitHub.
- **Anthropic** — if the marketplace agent's AI planning is enabled, the text of questions sent to the agent is processed by Anthropic to find matching racks.

## Your choices and rights

- Change your email, password or two-factor settings in **Settings → Security & account**.
- Delete your account (and everything you've published) at any time in the same place.
- To access or correct other data, ${contactLine()}.

## Children

SkiHost isn't directed at children under 13, and they shouldn't create accounts.

## Changes

We'll post updates here and change the date above.

## Contact

Privacy questions: ${contactLine()}.
`;
}
