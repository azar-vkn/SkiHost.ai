import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { MfaCodeForm } from "@/components/security-forms";
import { signOut } from "@/app/actions/auth";
import { safeNext } from "@/lib/safe-next";

export const metadata: Metadata = { title: "Two-factor authentication" };

export default async function MfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  const db = await createClient();
  const { data } = await db.auth.mfa.getAuthenticatorAssuranceLevel();
  if (!data || data.nextLevel !== "aal2") redirect("/login");
  if (data.currentLevel === "aal2") redirect(next);

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center px-4 py-16">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-subtle text-accent">
        <ShieldCheck className="h-6 w-6" />
      </span>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight">Two-factor authentication</h1>
      <p className="mt-1 text-center text-sm text-muted">Enter the code from your authenticator app to finish signing in.</p>
      <div className="card mt-8 w-full p-5">
        <MfaCodeForm next={next} />
      </div>
      <form action={signOut} className="mt-4">
        <button className="text-sm text-muted hover:text-fg">Use a different account</button>
      </form>
    </div>
  );
}
