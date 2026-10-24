import { NextResponse } from "next/server";
import { PackageError } from "./package-format";
import { RegistryError } from "./registry";

/** Agents call the API from anywhere, so every API response is CORS-open (no cookies are honoured cross-site). */
export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, X-SkiHost-Client, Mcp-Session-Id, Mcp-Protocol-Version",
  "Access-Control-Expose-Headers": "X-SkiHost-Version, X-SkiHost-Sha256, Mcp-Session-Id",
};

export function json(data: unknown, init: ResponseInit = {}) {
  return NextResponse.json(data, { ...init, headers: { ...CORS_HEADERS, ...init.headers } });
}

export function errorResponse(err: unknown) {
  if (err instanceof RegistryError || err instanceof PackageError) {
    const code = err.code;
    return json(
      { error: { code, message: err.message } },
      { status: err.status, headers: err.status === 429 ? { "Retry-After": "60" } : undefined },
    );
  }
  console.error(err);
  return json({ error: { code: "internal", message: "Internal error" } }, { status: 500 });
}

export function preflight() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/** `Authorization: Bearer skh_...` (or `token skh_...`, like GitHub). */
export function bearerToken(req: Request): string | null {
  const h = req.headers.get("authorization");
  if (!h) return null;
  const m = h.match(/^(?:Bearer|token)\s+(\S+)$/i);
  return m ? m[1] : null;
}

/** Public origin of this deployment, used in install commands and agent cards. */
export function baseUrl(req: Request) {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}
