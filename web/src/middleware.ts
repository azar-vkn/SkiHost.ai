import type { NextRequest } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";

/**
 * Every page request: a fresh CSP nonce (Next.js applies it to its own scripts; the layout to the
 * theme script), Supabase session refresh, and the two-factor step-up redirect.
 */
export async function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(nonce);
  request.headers.set("x-nonce", nonce);
  request.headers.set("content-security-policy", csp);
  const response = await updateSession(request);
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

function contentSecurityPolicy(nonce: string) {
  const dev = process.env.NODE_ENV !== "production";
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // Tailwind ships CSS files; a few components set inline style attributes.
    "style-src 'self' 'unsafe-inline'",
    // README images can point anywhere (like GitHub); they can't run code.
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self' ${supabase}${dev ? " ws: wss:" : ""}`,
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    `form-action 'self' ${supabase} https://accounts.google.com`,
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export const config = {
  // Pages only: API routes, the MCP/A2A endpoints and static files skip the session refresh.
  matcher: ["/((?!api|_next/static|_next/image|cli|\\.well-known|llms.txt|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
