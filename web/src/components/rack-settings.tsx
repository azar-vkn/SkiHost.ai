"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";

/** Owner-only editor for a rack's About details, with delete in a danger zone. */
export function RackAboutEditor({
  owner,
  name,
  description,
  keywords,
  homepage,
  repository,
}: {
  owner: string;
  name: string;
  description: string;
  keywords: string[];
  homepage: string | null;
  repository: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ description, topics: keywords.join(", "), homepage: homepage ?? "", repository: repository ?? "" });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/v1/packages/${owner}/${name}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: form.description,
        keywords: form.topics.split(",").map((t) => t.trim()).filter(Boolean),
        homepage: form.homepage,
        repository: form.repository,
      }),
    });
    setBusy(false);
    if (!res.ok) return setError((await res.json()).error?.message ?? "Could not save");
    setOpen(false);
    router.refresh();
  }

  async function remove() {
    const typed = window.prompt(`Delete the rack ${owner}/${name} and every version in it? This cannot be undone.\n\nType "${name}" to confirm:`);
    if (typed !== name) return;
    setBusy(true);
    const res = await fetch(`/api/v1/packages/${owner}/${name}`, { method: "DELETE" });
    if (!res.ok) {
      setBusy(false);
      return setError((await res.json()).error?.message ?? "Could not delete");
    }
    router.push(`/${owner}`);
    router.refresh();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn btn-ghost h-7 px-2 text-xs text-muted" aria-label="Edit rack details">
        <Pencil className="h-3.5 w-3.5" /> Edit
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-24" onClick={() => setOpen(false)}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="card w-full max-w-lg space-y-4 p-5 shadow-card">
        <h2 className="text-lg font-semibold">Edit rack details</h2>
        <Field label="Description">
          <textarea value={form.description} onChange={set("description")} required rows={3} maxLength={500} className="input" />
        </Field>
        <Field label="Topics" hint="Comma separated. Agents search these.">
          <input value={form.topics} onChange={set("topics")} className="input" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Homepage">
            <input value={form.homepage} onChange={set("homepage")} type="url" className="input" placeholder="https://" />
          </Field>
          <Field label="Source repository">
            <input value={form.repository} onChange={set("repository")} type="url" className="input" placeholder="https://github.com/…" />
          </Field>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex items-center justify-between gap-2 border-t border-line pt-4">
          <button type="button" onClick={remove} disabled={busy} className="btn border-danger/40 text-danger hover:border-danger">
            <Trash2 className="h-4 w-4" /> Delete rack
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={() => setOpen(false)} className="btn">
              Cancel
            </button>
            <button disabled={busy} className="btn btn-primary">
              {busy ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}
