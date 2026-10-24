import { createAnonClient } from "@/utils/supabase/server";
import { json } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Deployment check: database reachability and which protections are active. Reports only whether
 * secrets are configured, never their values.
 */
export async function GET(req: Request) {
  try {
    await rateLimit(req.headers, "read");
  } catch {
    return json({ ok: false, error: "rate_limited" }, { status: 429 });
  }
  const db = createAnonClient();
  const started = Date.now();
  const { error } = await db.rpc("get_stats");
  const dbLatency = Date.now() - started;

  const secret = process.env.SKIHOST_SERVER_SECRET;
  let secretState: "missing" | "valid" | "invalid" = "missing";
  if (secret) {
    const res = await db.rpc("consume_ip_quota", { p_secret: secret, p_key: "health-check", p_limit: 1_000_000, p_window_seconds: 60 });
    secretState = res.error ? "invalid" : "valid";
  }

  const ok = !error;
  return json(
    {
      ok,
      database: ok ? "ok" : "unreachable",
      database_latency_ms: dbLatency,
      server_secret: secretState,
      rate_limiting: secretState === "valid" ? "database (fleet-wide)" : "in-memory (per instance) — set SKIHOST_SERVER_SECRET",
      llm_agent: process.env.ANTHROPIC_API_KEY ? "enabled" : "disabled",
      github_token: process.env.GITHUB_TOKEN ? "configured" : "not configured (60 GitHub API calls/hour)",
      site_url: process.env.NEXT_PUBLIC_SITE_URL ?? null,
      region: process.env.VERCEL_REGION ?? null,
    },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
