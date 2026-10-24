import { headers } from "next/headers";
import { createAnonClient, createClient } from "@/utils/supabase/server";
import { bearerToken } from "./http";
import { RegistryError } from "./registry";

/**
 * The client + token pair for an API request: token callers (CLI, agents) use the
 * session-less client, everyone else falls back to their browser session cookie.
 * Cookie-authenticated writes must come from SkiHost's own pages (CSRF protection on top of
 * SameSite cookies); token callers are unaffected because browsers never attach tokens on their own.
 */
export async function requestDb(req: Request) {
  const token = bearerToken(req);
  if (token) return { db: createAnonClient(), token };
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && !isSameOrigin(req)) {
    throw new RegistryError("Cross-site request blocked. Use an API token for programmatic access.", 403, "csrf_blocked");
  }
  return { db: await createClient(), token: null };
}

function isSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return req.headers.get("sec-fetch-site") === "same-origin";
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  const allowed = new Set([req.headers.get("x-forwarded-host"), req.headers.get("host"), new URL(req.url).host]);
  if (process.env.NEXT_PUBLIC_SITE_URL) allowed.add(new URL(process.env.NEXT_PUBLIC_SITE_URL).host);
  return allowed.has(host);
}

/** Public origin for Server Components (install snippets, docs). */
export async function siteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
