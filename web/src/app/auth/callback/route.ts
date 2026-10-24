import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { baseUrl } from "@/lib/http";
import { safeNext } from "@/lib/safe-next";

/**
 * Landing point for Google sign-in, email confirmation links and password-reset links.
 * Exchanges the one-time `code` for a session cookie, then continues to `next`
 * (or to /welcome first for a new Google account that still has to pick its username).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const base = baseUrl(req);
  const next = safeNext(url.searchParams.get("next"));
  const failed = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (failed) return NextResponse.redirect(`${base}/login?error=${encodeURIComponent(failed)}`);

  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(`${base}/login?error=${encodeURIComponent("That sign-in link is incomplete. Try again.")}`);

  const db = await createClient();
  const { data, error } = await db.auth.exchangeCodeForSession(code);
  if (error) {
    // A missing or mismatched PKCE verifier means the link was opened in another browser, or it expired.
    const message =
      ["flow_state_not_found", "flow_state_expired", "bad_code_verifier"].includes(error.code ?? "") || /code verifier/i.test(error.message)
        ? "That link was opened in a different browser or has expired. Sign in here instead."
        : error.message;
    return NextResponse.redirect(`${base}/login?error=${encodeURIComponent(message)}`);
  }

  const { data: profile } = await db.from("profiles").select("onboarded").eq("user_id", data.user.id).maybeSingle();
  if (profile && !profile.onboarded && next !== "/reset-password") {
    return NextResponse.redirect(`${base}/welcome?next=${encodeURIComponent(next)}`);
  }
  return NextResponse.redirect(`${base}${next}`);
}
