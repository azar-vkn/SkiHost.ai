import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

// Pages a half-signed-in user (password done, two-factor code pending) may still open.
const MFA_EXEMPT = ["/login/mfa", "/auth/callback", "/terms", "/privacy", "/security"];

/** Refreshes the Supabase Auth session cookie, and sends accounts with 2FA to the code step until they pass it. */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
      },
    },
  });

  // Reading the claims is what triggers a refresh of an expiring session.
  const { data } = await supabase.auth.getClaims();
  if (data?.claims?.sub) {
    const path = request.nextUrl.pathname;
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2" && !MFA_EXEMPT.some((p) => path.startsWith(p))) {
      const url = request.nextUrl.clone();
      url.pathname = "/login/mfa";
      url.search = `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
      const redirect = NextResponse.redirect(url);
      supabaseResponse.cookies.getAll().forEach((c) => redirect.cookies.set(c));
      return redirect;
    }
  }
  return supabaseResponse;
}
