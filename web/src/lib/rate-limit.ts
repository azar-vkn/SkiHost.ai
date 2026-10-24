import { createAnonClient } from "@/utils/supabase/server";
import { RegistryError } from "./registry";

/**
 * Per-client rate limits. Expensive or abusable endpoints are counted in Postgres (shared by every
 * server instance, keyed by client IP, writable only with SKIHOST_SERVER_SECRET); cheap reads use an
 * in-memory window per instance. Without the secret everything falls back to memory, which still
 * caps each instance but not the fleet — set the secret in production.
 */

type Store = "db" | "memory";
const LIMITS = {
  read: { limit: 300, window: 60, store: "memory" },
  search: { limit: 120, window: 60, store: "memory" },
  download: { limit: 60, window: 60, store: "db" },
  write: { limit: 60, window: 60, store: "db" },
  import: { limit: 10, window: 600, store: "db" },
  agent: { limit: 30, window: 60, store: "db" },
  agentLlm: { limit: 10, window: 3600, store: "db" },
  mcp: { limit: 120, window: 60, store: "db" },
  a2a: { limit: 60, window: 60, store: "db" },
  login: { limit: 10, window: 300, store: "db" },
  signup: { limit: 5, window: 3600, store: "db" },
  reset: { limit: 5, window: 3600, store: "db" },
} satisfies Record<string, { limit: number; window: number; store: Store }>;

export type Bucket = keyof typeof LIMITS;

/** The client's IP. On Vercel these headers are set by the platform and can't be spoofed by clients. */
export function clientIp(h: Headers): string {
  const ip = h.get("x-real-ip") || h.get("x-vercel-forwarded-for") || h.get("x-forwarded-for")?.split(",")[0] || "local";
  return ip.trim().slice(0, 64);
}

/** Throws a 429 RegistryError when `key` (default: the client IP) has used up `bucket`. */
export async function rateLimit(h: Headers, bucket: Bucket, key?: string) {
  if (!(await allow(h, bucket, key))) {
    const { window } = LIMITS[bucket];
    const wait = window >= 3600 ? `${Math.round(window / 3600)} hour(s)` : window >= 120 ? `${Math.round(window / 60)} minutes` : "a minute";
    throw new RegistryError(`Too many requests. Please wait ${wait} and try again.`, 429, "rate_limited");
  }
}

/** Like rateLimit but returns false instead of throwing (for soft limits such as the agent's LLM use). */
export async function allow(h: Headers, bucket: Bucket, key?: string) {
  const { limit, window, store } = LIMITS[bucket];
  const id = `${bucket}:${key ?? clientIp(h)}`;
  if (store === "db") {
    const ok = await dbHit(id, limit, window);
    if (ok !== null) return ok;
  }
  return memoryHit(id, limit, window);
}

/** A fleet-wide counter not tied to any client (e.g. the agent's daily LLM budget). */
export async function allowGlobal(name: string, limit: number, window: number) {
  return (await dbHit(`global:${name}`, limit, window)) ?? memoryHit(`global:${name}`, limit, window);
}

async function dbHit(key: string, limit: number, window: number): Promise<boolean | null> {
  const secret = process.env.SKIHOST_SERVER_SECRET;
  if (!secret) return null;
  const { data, error } = await createAnonClient().rpc("consume_ip_quota", {
    p_secret: secret,
    p_key: key,
    p_limit: limit,
    p_window_seconds: window,
  });
  if (error) {
    console.error(`[rate-limit] database counter unavailable (${error.message}); using in-memory limits`);
    return null;
  }
  return data === true;
}

const memory = new Map<string, { count: number; reset: number }>();
function memoryHit(key: string, limit: number, window: number) {
  const now = Date.now();
  if (memory.size > 50_000) for (const [k, v] of memory) if (v.reset < now) memory.delete(k);
  const entry = memory.get(key);
  if (!entry || entry.reset < now) {
    memory.set(key, { count: 1, reset: now + window * 1000 });
    return true;
  }
  entry.count++;
  return entry.count <= limit;
}

/** Per-account quota counted in the database, so it holds across instances and can't be dodged by changing IP. */
export async function accountQuota(token: string | null, db: ReturnType<typeof createAnonClient>, bucket: string, limit: number, window: number) {
  const { data, error } = await db.rpc("consume_actor_quota", { p_token: token, p_bucket: bucket, p_limit: limit, p_window_seconds: window });
  if (error) return; // auth errors surface from the real call that follows
  if (data === false) throw new RegistryError("You've hit the limit for this action. Please try again later.", 429, "rate_limited");
}
