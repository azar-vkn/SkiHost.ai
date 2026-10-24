"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import type { PackageSource } from "@/lib/package-format";

/** Re-import the rack's GitHub source; a new version is pushed only when the branch has new commits. */
export function GitHubSyncButton({ rack, source }: { rack: string; source: PackageSource }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function sync() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/v1/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Follow the branch (not the pinned commit) so new commits are picked up.
        // Rights were confirmed when the rack was first imported from this same source.
        body: JSON.stringify({ url: `https://github.com/${source.repo}`, ref: source.ref, path: source.path, name: rack, confirm_rights: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message ?? "Sync failed");
      if (data.up_to_date) setMessage({ ok: true, text: `Up to date with ${source.ref}.` });
      else {
        setMessage({ ok: true, text: `Imported v${data.version} from ${source.ref}.` });
        router.refresh();
      }
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Sync failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <button onClick={sync} disabled={busy} className="btn h-7 w-full px-2.5 text-xs">
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        {busy ? "Checking GitHub…" : "Sync from GitHub"}
      </button>
      {message && <p className={`text-xs ${message.ok ? "text-success" : "text-danger"}`}>{message.text}</p>}
    </div>
  );
}
