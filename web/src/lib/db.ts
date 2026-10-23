import { headers } from "next/headers";
import { createAnonClient, createClient } from "@/utils/supabase/server";
import { bearerToken } from "./http";

/**
 * The client + token pair for an API request: token callers (CLI, agents) use the
 * session-less client, everyone else falls back to their browser session cookie.
 */
export async function requestDb(req: Request) {
  const token = bearerToken(req);
  return token ? { db: createAnonClient(), token } : { db: await createClient(), token: null };
}

/** Public origin for Server Components (install snippets, docs). */
export async function siteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
