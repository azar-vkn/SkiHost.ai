import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { KeyRound } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { getCurrentProfile } from "@/lib/session";
import { siteUrl } from "@/lib/db";
import { shortDate, timeAgo } from "@/lib/format";
import { revokeToken } from "@/app/actions/tokens";
import { TokenForm } from "@/components/token-form";
import { CommandLine } from "@/components/copy-button";

export const metadata: Metadata = { title: "API tokens" };

type TokenRow = { id: string; name: string; prefix: string; created_at: string; last_used_at: string | null; revoked_at: string | null };

export default async function TokensPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const me = await getCurrentProfile();
  if (!me) redirect("/login?next=/settings/tokens");
  const { welcome } = await searchParams;
  const db = await createClient();
  const [{ data }, base] = await Promise.all([
    db.from("api_tokens").select("id, name, prefix, created_at, last_used_at, revoked_at").order("created_at", { ascending: false }),
    siteUrl(),
  ]);
  const tokens = (data ?? []) as TokenRow[];
  const active = tokens.filter((t) => !t.revoked_at);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      {welcome && (
        <div className="card mb-8 border-accent-line bg-accent-subtle p-5">
          <h2 className="font-semibold">Welcome to SkiHost, {me.username}! 🎿</h2>
          <p className="mt-1 text-sm text-muted">Generate a token below so the CLI and your agents can publish as you.</p>
        </div>
      )}
      <h1 className="flex items-center gap-2 text-2xl font-semibold">
        <KeyRound className="h-6 w-6 text-accent" /> API tokens
      </h1>
      <p className="mt-2 text-sm text-muted">
        Tokens let the <code>skihost</code> CLI, MCP clients and other agents publish and star packages as <strong className="text-fg">{me.username}</strong>.
        Treat them like passwords. Reading the registry never needs a token.
      </p>

      <section className="mt-8">
        <TokenForm base={base} />
      </section>

      <section className="mt-10">
        <h2 className="mb-3 font-semibold">Active tokens</h2>
        <div className="card divide-y divide-line-muted">
          {active.length === 0 && <p className="px-5 py-8 text-center text-sm text-muted">No active tokens yet.</p>}
          {active.map((t) => (
            <div key={t.id} className="flex items-center gap-4 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{t.name}</p>
                <p className="text-xs text-muted">
                  <code>{t.prefix}…</code> · created {shortDate(t.created_at)} · {t.last_used_at ? `last used ${timeAgo(t.last_used_at)}` : "never used"}
                </p>
              </div>
              <form action={revokeToken}>
                <input type="hidden" name="id" value={t.id} />
                <button className="btn h-7 border-danger/40 px-2.5 text-xs text-danger hover:border-danger">Revoke</button>
              </form>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10 space-y-2">
        <h2 className="font-semibold">Or log in from the terminal</h2>
        <p className="text-sm text-muted">The CLI exchanges your email and password for a token once and stores only the token.</p>
        <CommandLine command={`skihost login --registry ${base}`} />
      </section>
    </div>
  );
}
