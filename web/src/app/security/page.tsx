import type { Metadata } from "next";
import { Markdown } from "@/components/markdown";
import { contactLine, LEGAL_UPDATED } from "@/lib/legal";
import { RISK_FLAGS } from "@/lib/security-scan";

export const metadata: Metadata = { title: "Security" };

export default function SecurityPolicyPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <Markdown source={security()} />
    </article>
  );
}

function security() {
  const flags = Object.entries(RISK_FLAGS)
    .map(([k, v]) => `| \`${k}\` | ${v} |`)
    .join("\n");
  return `# Security

_Last updated: ${LEGAL_UPDATED}_

## Report a vulnerability

SkiHost is a product of Esriel. 
Found a security issue in SkiHost itself? Please ${contactLine()} with steps to reproduce. Give us a reasonable time to fix it before disclosing it publicly. Please don't access other people's data, degrade the service, or run automated scans at high volume; we won't pursue good-faith research that follows these rules.

## Report a malicious or infringing rack

Every rack page has a **Report** button (you need to be signed in). Reports go straight to moderators, who can disable a rack for everyone, yank versions and suspend accounts. For urgent cases, ${contactLine()}.

## How SkiHost protects you

- **Secrets are blocked at publish time.** Pushes that contain what look like real API keys, private keys or database passwords are rejected.
- **Risk warnings.** Every version is scanned for risky patterns and shows warnings on its page, in the API and in \`skihost install\` output:

| Warning | Meaning |
| --- | --- |
${flags}

- **Integrity.** Every version is immutable and has a SHA-256 checksum that the CLI verifies on install.
- **Provenance.** Racks imported from GitHub record the exact repository, branch, folder and commit.
- **Accounts.** Passwords are hashed by our auth provider, API tokens are stored only as hashes and can expire, and two-factor authentication is available for every account (Settings → Security & account).
- **Abuse limits.** Rate limits, storage quotas and per-account limits protect the service, and moderators can quarantine racks and suspend accounts.

## Installing safely

1. Read the rack's files (the **Files** tab) before letting an agent run them, especially anything with risk warnings.
2. Pin versions: \`skihost install owner/name@1.2.0\`, and commit \`skihost.lock.json\`.
3. Prefer racks from publishers you trust, and check the GitHub source for imported racks.
4. Never give a skill more access (keys, file system, network) than its task needs.
5. If a version is yanked, upgrade: yanking usually means the author found a problem.
`;
}
