import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/utils/supabase/server";
import { WelcomeForm } from "@/components/auth-form";
import { safeNext } from "@/lib/safe-next";

export const metadata: Metadata = { title: "Welcome" };

/** One-time step for accounts created with Google: confirm or change the generated username. */
export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  const db = await createClient();
  const { data: auth } = await db.auth.getClaims();
  if (!auth?.claims?.sub) redirect("/login");
  const { data: profile } = await db
    .from("profiles")
    .select("username, display_name, onboarded")
    .eq("user_id", auth.claims.sub)
    .maybeSingle();
  if (!profile || profile.onboarded) redirect(next);
  return <WelcomeForm username={profile.username} displayName={profile.display_name} next={next} />;
}
