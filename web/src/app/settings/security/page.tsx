import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { getCurrentProfile } from "@/lib/session";
import { shortDate } from "@/lib/format";
import { disableMfa } from "@/app/actions/account";
import { ChangeEmailForm, DeleteAccountForm, MfaEnroll } from "@/components/security-forms";
import { SettingsNav } from "@/components/settings-nav";

export const metadata: Metadata = { title: "Security & account" };

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const me = await getCurrentProfile();
  if (!me) redirect("/login?next=/settings/security");
  const { notice, error } = await searchParams;
  const db = await createClient();
  const [{ data: factors }, { data: userData }] = await Promise.all([db.auth.mfa.listFactors(), db.auth.getUser()]);
  const totp = factors?.totp.find((f) => f.status === "verified");
  const hasPassword = (userData.user?.identities ?? []).some((i) => i.provider === "email");
  const providers = (userData.user?.identities ?? []).map((i) => i.provider);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="mb-6 text-2xl font-semibold">Settings</h1>
      <SettingsNav active="/settings/security" />
      {notice && <p className="mb-6 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">{notice}</p>}
      {error && <p className="mb-6 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

      <Section title="Two-factor authentication" description="Protects your account (and every rack other agents install from you) even if your password leaks.">
        {totp ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm">
              <ShieldCheck className="h-4 w-4 text-success" /> On — authenticator app added {shortDate(totp.created_at)}
            </p>
            <form action={disableMfa}>
              <input type="hidden" name="factorId" value={totp.id} />
              <button className="btn h-8 border-danger/40 text-xs text-danger hover:border-danger">Turn off</button>
            </form>
          </div>
        ) : (
          <MfaEnroll />
        )}
      </Section>

      <Section title="Password" description={hasPassword ? "Change the password you sign in with." : "You sign in with Google. Add a password to also use `skihost login` with your email."}>
        <Link href="/reset-password" className="btn">
          {hasPassword ? "Change password" : "Set a password"}
        </Link>
      </Section>

      <Section title="Email" description={`Sign-in methods: ${providers.join(", ") || "email"}.`}>
        <ChangeEmailForm email={me.email ?? ""} />
      </Section>

      <Section title="Delete account" danger description="Remove your account and everything you've published.">
        <DeleteAccountForm username={me.username} />
      </Section>
    </div>
  );
}

function Section({ title, description, danger, children }: { title: string; description: string; danger?: boolean; children: React.ReactNode }) {
  return (
    <section className={`card mb-6 p-5 ${danger ? "border-danger/40" : ""}`}>
      <h2 className={`font-semibold ${danger ? "text-danger" : ""}`}>{title}</h2>
      <p className="mt-1 mb-4 text-sm text-muted">{description}</p>
      {children}
    </section>
  );
}
