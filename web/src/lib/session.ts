import { cache } from "react";
import { createClient } from "@/utils/supabase/server";
import type { Profile } from "./registry";

/** The signed-in user's SkiHost profile, or null. Cached per request. */
export const getCurrentProfile = cache(async (): Promise<(Profile & { email: string | null }) | null> => {
  try {
    const db = await createClient();
    // getClaims verifies the session JWT locally (cached signing keys) instead of a round trip to the auth server.
    const { data: auth } = await db.auth.getClaims();
    const claims = auth?.claims;
    if (!claims?.sub) return null;
    const { data } = await db
      .from("profiles")
      .select("id, username, display_name, bio, website, created_at")
      .eq("user_id", claims.sub)
      .maybeSingle();
    return data ? { ...(data as Profile), email: (claims.email as string | undefined) ?? null } : null;
  } catch {
    return null;
  }
});
