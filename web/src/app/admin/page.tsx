import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { admin, REPORT_REASONS, type ReportRow } from "@/lib/registry";
import { getCurrentProfile } from "@/lib/session";
import { timeAgo } from "@/lib/format";
import { deleteRackAsAdmin, resolveReport, setRackStatus, suspendUser } from "@/app/actions/admin";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const me = await getCurrentProfile();
  // Non-admins get a plain 404 so the console isn't advertised; the database re-checks every action.
  if (me?.role !== "admin") notFound();
  const status = ["open", "actioned", "dismissed", "all"].includes((await searchParams).status ?? "") ? (await searchParams).status! : "open";
  let reports: ReportRow[];
  try {
    reports = await admin.listReports(await createClient(), status);
  } catch {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <ShieldAlert className="mx-auto h-8 w-8 text-danger" />
        <h1 className="mt-4 text-xl font-semibold">Turn on two-factor authentication to moderate</h1>
        <p className="mt-2 text-sm text-muted">Moderator powers need an admin account with an authenticator app, used in this browser session.</p>
        <Link href="/settings/security" className="btn btn-primary mt-6">
          Open security settings
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="flex items-center gap-2 text-2xl font-semibold">
        <ShieldAlert className="h-6 w-6 text-danger" /> Moderation
      </h1>
      <p className="mt-1 text-sm text-muted">Reports from users. Disabling a rack hides it from search and blocks downloads immediately.</p>

      <nav className="mt-6 flex gap-1 border-b border-line text-sm">
        {["open", "actioned", "dismissed", "all"].map((s) => (
          <Link
            key={s}
            href={`/admin?status=${s}`}
            className={`-mb-px border-b-2 px-3 py-2 capitalize ${status === s ? "border-accent font-medium" : "border-transparent text-muted hover:text-fg"}`}
          >
            {s}
          </Link>
        ))}
      </nav>

      <div className="mt-6 space-y-4">
        {reports.length === 0 && <p className="card p-8 text-center text-sm text-muted">No {status === "all" ? "" : status} reports.</p>}
        {reports.map((r) => (
          <ReportCard key={r.id} r={r} />
        ))}
      </div>

      <section className="card mt-10 space-y-3 p-5">
        <h2 className="font-semibold">Suspend or restore an account</h2>
        <form action={suspendUser} className="flex flex-wrap gap-2">
          <input name="username" required className="input max-w-48" placeholder="username" />
          <input name="reason" className="input max-w-sm" placeholder="Reason" />
          <select name="suspend" className="input w-32">
            <option value="true">Suspend</option>
            <option value="false">Restore</option>
          </select>
          <button className="btn">Apply</button>
        </form>
        <p className="text-xs text-muted">Suspending revokes all of the account&apos;s API tokens and blocks publishing; its racks disappear from search.</p>
      </section>
    </div>
  );
}

function ReportCard({ r }: { r: ReportRow }) {
  const disabled = r.rack_status === "quarantined";
  return (
    <article className="card p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/${r.owner}/${r.name}`} className="font-semibold text-accent hover:underline">
          {r.owner}/{r.name}
        </Link>
        <span className="rounded-full border border-danger/50 px-2 text-xs text-danger">{REPORT_REASONS[r.reason] ?? r.reason}</span>
        {disabled && <span className="rounded-full border border-warning/50 px-2 text-xs text-warning">rack disabled</span>}
        {r.owner_suspended && <span className="rounded-full border border-warning/50 px-2 text-xs text-warning">owner suspended</span>}
        <span className="ml-auto text-xs text-faint">
          {r.reporter ? `by ${r.reporter} · ` : ""}
          {timeAgo(r.created_at)} · {r.status}
        </span>
      </div>
      {r.details && <p className="mt-2 whitespace-pre-wrap text-muted">{r.details}</p>}
      {r.resolution && <p className="mt-2 text-xs text-muted">Resolution: {r.resolution}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        <form action={setRackStatus}>
          <input type="hidden" name="owner" value={r.owner} />
          <input type="hidden" name="name" value={r.name} />
          <input type="hidden" name="status" value={disabled ? "active" : "quarantined"} />
          <input type="hidden" name="reason" value={`Disabled after a report: ${REPORT_REASONS[r.reason] ?? r.reason}`} />
          <button className={`btn h-7 text-xs ${disabled ? "" : "border-danger/50 text-danger"}`}>{disabled ? "Restore rack" : "Disable rack"}</button>
        </form>
        <form action={suspendUser}>
          <input type="hidden" name="username" value={r.owner} />
          <input type="hidden" name="suspend" value={r.owner_suspended ? "false" : "true"} />
          <input type="hidden" name="reason" value={`Report on ${r.owner}/${r.name}`} />
          <button className="btn h-7 text-xs">{r.owner_suspended ? "Restore owner" : "Suspend owner"}</button>
        </form>
        <form action={deleteRackAsAdmin}>
          <input type="hidden" name="owner" value={r.owner} />
          <input type="hidden" name="name" value={r.name} />
          <button className="btn h-7 border-danger/50 text-xs text-danger">Delete rack</button>
        </form>
        {r.status === "open" ? (
          <>
            <form action={resolveReport}>
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="status" value="actioned" />
              <button className="btn h-7 text-xs">Mark actioned</button>
            </form>
            <form action={resolveReport}>
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="status" value="dismissed" />
              <button className="btn h-7 text-xs">Dismiss</button>
            </form>
          </>
        ) : (
          <form action={resolveReport}>
            <input type="hidden" name="id" value={r.id} />
            <input type="hidden" name="status" value="open" />
            <button className="btn h-7 text-xs">Reopen</button>
          </form>
        )}
      </div>
    </article>
  );
}
