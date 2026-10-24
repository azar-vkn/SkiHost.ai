/** Only same-site paths are allowed as post-login destinations (no `//host` or `/\host` open redirects). */
export function safeNext(v: unknown, fallback = "/") {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : fallback;
}
