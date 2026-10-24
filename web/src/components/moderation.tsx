"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Flag, Undo2, XCircle } from "lucide-react";
import { REPORT_REASONS } from "@/lib/report-reasons";

/** "Report" on a rack page: sends the reason to moderators. */
export function ReportButton({ owner, name, signedIn }: { owner: string; name: string; signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<keyof typeof REPORT_REASONS>("malware");
  const [details, setDetails] = useState("");
  const [state, setState] = useState<{ ok?: boolean; error?: string; busy?: boolean }>({});

  if (!signedIn) {
    return (
      <Link href={`/login?next=/${owner}/${name}`} className="btn btn-ghost h-8 px-2.5 text-xs text-muted" title="Sign in to report">
        <Flag className="h-3.5 w-3.5" /> Report
      </Link>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState({ busy: true });
    const res = await fetch(`/api/v1/packages/${owner}/${name}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason, details }),
    });
    const data = await res.json();
    setState(res.ok ? { ok: true } : { error: data.error?.message ?? "Couldn't send the report" });
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn btn-ghost h-8 px-2.5 text-xs text-muted">
        <Flag className="h-3.5 w-3.5" /> Report
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-24" onClick={() => setOpen(false)}>
          <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="card w-full max-w-md space-y-4 p-5 shadow-card">
            <h2 className="text-lg font-semibold">
              Report {owner}/{name}
            </h2>
            {state.ok ? (
              <>
                <p className="text-sm text-success">Thanks — moderators will review this rack.</p>
                <button type="button" onClick={() => setOpen(false)} className="btn">
                  Close
                </button>
              </>
            ) : (
              <>
                <fieldset className="space-y-1.5">
                  {Object.entries(REPORT_REASONS).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 text-sm">
                      <input type="radio" name="reason" checked={reason === key} onChange={() => setReason(key as keyof typeof REPORT_REASONS)} className="accent-[var(--accent)]" />
                      {label}
                    </label>
                  ))}
                </fieldset>
                <textarea
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  rows={3}
                  maxLength={2000}
                  className="input"
                  placeholder="What did you find? File names and lines help."
                />
                {state.error && <p className="text-sm text-danger">{state.error}</p>}
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setOpen(false)} className="btn">
                    Cancel
                  </button>
                  <button disabled={state.busy} className="btn btn-primary">
                    {state.busy ? "Sending…" : "Send report"}
                  </button>
                </div>
              </>
            )}
          </form>
        </div>
      )}
    </>
  );
}

/** Owner control on the Versions tab: yank a version (with a reason) or restore it. */
export function YankButton({ owner, name, version, yanked }: { owner: string; name: string; version: string; yanked: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function toggle() {
    let reason: string | null = null;
    if (!yanked) {
      reason = window.prompt(`Yank v${version}? Exact installs of it still work, but "latest" will skip it.\n\nReason (shown to users):`);
      if (reason === null) return;
    }
    setBusy(true);
    const res = await fetch(`/api/v1/packages/${owner}/${name}/versions/${version}/yank`, {
      method: yanked ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: yanked ? undefined : JSON.stringify({ reason }),
    });
    setBusy(false);
    if (!res.ok) window.alert((await res.json()).error?.message ?? "Failed");
    router.refresh();
  }
  return (
    <button onClick={toggle} disabled={busy} className="btn h-7 px-2.5 text-xs">
      {yanked ? <Undo2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
      {busy ? "…" : yanked ? "Restore" : "Yank"}
    </button>
  );
}
