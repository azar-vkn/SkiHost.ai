import type { Metadata } from "next";
import { Markdown } from "@/components/markdown";
import { contactLine, LEGAL_UPDATED } from "@/lib/legal";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <Markdown source={terms()} />
    </article>
  );
}

function terms() {
  return `# Terms of Service

_Last updated: ${LEGAL_UPDATED}_

SkiHost is a product of **Esriel** ("Esriel", "we", "us"). These terms cover your use of SkiHost — the website, the registry API, the \`skihost\` command-line tool, the MCP and A2A endpoints, and the marketplace agent (together, "the service"). By creating an account or using the service you agree to them. They form an agreement between you and Esriel.

## 1. Accounts

- You need an account to publish, star, report or create API tokens. Reading and installing public racks doesn't need one.
- Keep your password, two-factor device and API tokens secret. You're responsible for everything done with your account or tokens. Revoke a token immediately if it may have leaked.
- One person or organisation per account; usernames must not impersonate others. We may reclaim usernames that are misleading or unused.

## 2. What you publish

- You keep ownership of what you publish. By publishing a rack you grant Esriel and SkiHost users a worldwide, royalty-free licence to host, copy, display and distribute it as part of the service, and users the rights stated in the licence you choose for it.
- Only publish content you have the right to publish — your own work, or work whose licence allows redistribution. When importing from GitHub you confirm this for every import.
- Published versions are immutable and other people may depend on them. You can yank a version or delete a rack, but copies already installed stay with their users.
- You're responsible for keeping credentials out of your packages. SkiHost blocks publishes that look like they contain secrets, but that check is a safety net, not a guarantee.

## 3. Acceptable use

You must not use the service to publish, distribute or do any of the following:

- malware, spyware, ransomware, credential stealers, cryptocurrency miners, or code that does anything harmful or undisclosed on the machines that install it;
- skills or prompts designed to hijack, manipulate or exfiltrate data from AI agents (prompt-injection attacks);
- content that is illegal, infringes someone else's rights, or contains other people's personal data or secrets;
- spam, squatting on names, or packages that impersonate other projects or people;
- attempts to break, overload, scrape at abusive rates, or get around the service's limits and security controls.

Security research is welcome when it follows our [security policy](/security).

## 4. Moderation

Esriel scans what's published on SkiHost and acts on reports. We may disable (quarantine) or delete racks, yank versions, revoke tokens, or suspend accounts that break these terms or put users at risk, with or without notice. If you think we got it wrong, contact us (see below).

## 5. Installing other people's content

Racks are published by their authors, not by Esriel. Review what you install, especially anything your agents will run. Risk warnings shown by SkiHost are heuristics and can miss things. Content is provided "as is", without warranties of any kind from Esriel.

## 6. Copyright complaints

If you believe a rack infringes your copyright, ${contactLine()} with the rack's address, the work you own, and a statement that you're authorised to act. We'll remove infringing content and may suspend repeat infringers.

## 7. The service

We may change, limit (for example with rate limits and storage quotas) or discontinue parts of the service. The marketplace agent's answers are generated automatically and may be wrong.

## 8. Disclaimer and liability

THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE". TO THE FULLEST EXTENT PERMITTED BY LAW, ESRIEL DISCLAIMS ALL WARRANTIES AND IS NOT LIABLE FOR INDIRECT, INCIDENTAL OR CONSEQUENTIAL DAMAGES, OR FOR ANY LOSS ARISING FROM CONTENT PUBLISHED BY OTHER USERS.

## 9. Ending use

You can delete your account at any time in **Settings → Security & account**. We may end or suspend access for breaches of these terms.

## 10. Changes

We'll post updated terms here and change the date above. Continuing to use the service means you accept the updated terms.

## Contact

Questions about these terms: ${contactLine()}.
`;
}
