export function compactNumber(n: number) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n ?? 0);
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function timeAgo(iso: string) {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  const steps: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [30, "day"],
    [12, "month"],
    [Infinity, "year"],
  ];
  let value = s;
  for (const [size, unit] of steps) {
    if (value < size) return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(-Math.floor(value), unit);
    value /= size;
  }
  return "";
}

export function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en", { year: "numeric", month: "short", day: "numeric" });
}

/** highlight.js language from a file path; null means plain text. */
export function languageFor(path: string): string | null {
  const name = path.split("/").pop()!.toLowerCase();
  if (name === "dockerfile") return "dockerfile";
  if (name === "makefile") return "makefile";
  if (name.endsWith("requirements.txt")) return "plaintext";
  const ext = name.includes(".") ? name.split(".").pop()! : "";
  const map: Record<string, string> = {
    js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "javascript",
    ts: "typescript", tsx: "typescript", py: "python", rb: "ruby", go: "go", rs: "rust",
    java: "java", kt: "kotlin", cs: "csharp", php: "php", sh: "bash", bash: "bash", zsh: "bash",
    ps1: "powershell", json: "json", yml: "yaml", yaml: "yaml", toml: "ini", ini: "ini",
    md: "markdown", html: "xml", xml: "xml", css: "css", sql: "sql", swift: "swift", c: "c", h: "c", cpp: "cpp",
  };
  return map[ext] ?? null;
}
