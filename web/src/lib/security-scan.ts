/**
 * Publish-time scanning. Two outcomes:
 *  - secrets: real-looking credentials block the publish (protects publishers from leaking keys),
 *  - risk flags: patterns installers should know about (piping downloads into a shell, obfuscation,
 *    destructive commands, binaries, instruction-override text). They don't block; they're shown on
 *    the rack page, in the API and by `skihost install`, so people and agents decide with eyes open.
 * Heuristics, not a malware verdict: absence of flags doesn't mean a package is safe.
 */

export interface SecretFinding {
  path: string;
  line: number;
  kind: string;
}

export const RISK_FLAGS = {
  "downloads-and-executes": "Downloads code from the internet and runs it immediately (e.g. curl … | sh)",
  "obfuscated-code": "Contains encoded or obfuscated code that is decoded and executed at runtime",
  "destructive-commands": "Contains commands that can delete or overwrite large parts of a system",
  "reverse-shell": "Contains patterns used to open a remote shell to another machine",
  "crypto-mining": "References cryptocurrency mining software or pools",
  "reads-credentials": "Reads credential files such as SSH keys, cloud credentials or browser logins",
  "binary-executables": "Includes compiled executables or libraries that can't be reviewed as text",
  "instruction-override-text": "Contains text that tries to override an AI agent's instructions (possible prompt injection)",
} as const;
export type RiskFlag = keyof typeof RISK_FLAGS;

const SECRET_PATTERNS: [string, RegExp][] = [
  ["AWS access key", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP |ENCRYPTED )?PRIVATE KEY-----/],
  ["GitHub token", /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})\b/],
  ["Slack token", /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
  ["Slack webhook", /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]{20,}/],
  ["Stripe live key", /\b[rs]k_live_[A-Za-z0-9]{20,}\b/],
  ["Anthropic API key", /\bsk-ant-(?:api|admin)\d{2}-[A-Za-z0-9_-]{40,}\b/],
  ["OpenAI API key", /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20}T3BlbkFJ[A-Za-z0-9_-]{20,}\b/],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["Supabase secret key", /\bsb_secret_[A-Za-z0-9_-]{20,}\b/],
  ["SkiHost API token", /\bskh_[0-9a-f]{64}\b/],
  ["database URL with password", /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s:@/'"]+:([^\s@/'"]{6,})@[^\s'"]+/],
];

// Documentation placeholders that look like secrets but aren't. Checked against the secret part only
// (e.g. the password of a database URL), never the whole line, so "db.example.com" can't hide a real password.
const PLACEHOLDER =
  /example|xxxx|your[-_]?|placeholder|changeme|dummy|<[^>]*>|\$\{|\{\{|redacted|\*{4}|^(?:password|passwd|pass|secret|postgres|root|admin|test|user|pw)$/i;

const RISK_PATTERNS: [RiskFlag, RegExp][] = [
  ["downloads-and-executes", /\b(?:curl|wget)\b[^\n|]*\|\s*(?:sudo\s+)?(?:ba|z|da)?sh\b/],
  ["downloads-and-executes", /\b(?:iex|Invoke-Expression)\b[^\n]*(?:DownloadString|Invoke-WebRequest|iwr|irm)\b/i],
  ["downloads-and-executes", /\b(?:irm|iwr|Invoke-RestMethod|Invoke-WebRequest)\b[^\n|]*\|\s*(?:iex|Invoke-Expression)\b/i],
  ["obfuscated-code", /\beval\s*\(\s*(?:atob|Buffer\.from|unescape|String\.fromCharCode)\s*\(/],
  ["obfuscated-code", /\b(?:exec|eval)\s*\(\s*(?:base64\.b64decode|codecs\.decode|zlib\.decompress)/],
  ["obfuscated-code", /base64\s+(?:-d|--decode)\b[^\n|]*\|\s*(?:ba|z)?sh\b/],
  ["destructive-commands", /\brm\s+-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*\s+(?:--no-preserve-root\s+)?(?:\/|~|\$HOME|\/\*)(?:\s|$|;)/],
  ["destructive-commands", /\bmkfs\.[a-z0-9]+\s+\/dev\//],
  ["destructive-commands", /\bdd\s+[^\n]*\bof=\/dev\/(?:sd|nvme|hd|disk)/],
  ["destructive-commands", /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/],
  ["reverse-shell", /\/dev\/tcp\/(?:\d{1,3}\.){3}\d{1,3}\/\d+/],
  ["reverse-shell", /\bnc(?:at)?\s+[^\n]*-(?:e|c)\s+\/bin\/(?:ba)?sh/],
  ["reverse-shell", /\bbash\s+-i\s+>&\s*\/dev\/tcp/],
  ["crypto-mining", /\b(?:xmrig|stratum\+tcp:\/\/|coinhive|minexmr|nicehash)\b/i],
  ["reads-credentials", /(?:\.aws\/credentials|\.ssh\/id_(?:rsa|ed25519|ecdsa)|\.npmrc|\.pypirc|\.docker\/config\.json|Login Data|\.kube\/config|\.netrc)\b/],
  ["instruction-override-text", /\b(?:ignore|disregard|forget)\s+(?:all\s+|any\s+)?(?:previous|prior|above|earlier)\s+(?:instructions|prompts|rules)\b/i],
];

const BINARY_EXT = /\.(?:exe|dll|so|dylib|bin|msi|scr|com|apk|jar|class|pyc|wasm)$/i;

export function scanFiles(files: Record<string, Uint8Array>): { secrets: SecretFinding[]; flags: RiskFlag[] } {
  const secrets: SecretFinding[] = [];
  const flags = new Set<RiskFlag>();
  const decoder = new TextDecoder("utf-8", { fatal: false });

  for (const [path, bytes] of Object.entries(files)) {
    const magic = bytes.subarray(0, 4);
    const isElf = magic[0] === 0x7f && magic[1] === 0x45 && magic[2] === 0x4c && magic[3] === 0x46;
    const isPe = magic[0] === 0x4d && magic[1] === 0x5a;
    const isMachO = (magic[0] === 0xcf || magic[0] === 0xce) && magic[1] === 0xfa && magic[2] === 0xed && magic[3] === 0xfe;
    if (BINARY_EXT.test(path) || isElf || isPe || isMachO) {
      flags.add("binary-executables");
      continue;
    }
    if (bytes.subarray(0, 8000).includes(0) || bytes.byteLength > 2 * 1024 * 1024) continue;

    const text = decoder.decode(bytes);
    const lines = text.split("\n");
    for (let i = 0; i < lines.length && secrets.length < 20; i++) {
      const line = lines[i];
      if (line.length > 5000) continue;
      for (const [kind, re] of SECRET_PATTERNS) {
        const m = line.match(re);
        if (!m) continue;
        if (PLACEHOLDER.test(m[1] ?? m[0])) continue;
        secrets.push({ path, line: i + 1, kind });
      }
    }
    for (const [flag, re] of RISK_PATTERNS) if (!flags.has(flag) && re.test(text)) flags.add(flag);
    // Very long base64 blobs in source are a common way to smuggle payloads.
    if (!flags.has("obfuscated-code") && /^(?!.*\.(?:md|txt|json|svg|lock)$)/i.test(path) && /[A-Za-z0-9+/=]{4000,}/.test(text)) {
      flags.add("obfuscated-code");
    }
  }
  return { secrets, flags: [...flags].sort() as RiskFlag[] };
}
