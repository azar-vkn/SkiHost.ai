"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ExternalLink, FolderGit2, GitCommitHorizontal, Loader2, Scale, Search, Star } from "lucide-react";
import { TypeBadge } from "./type-badge";

type Candidate = {
  path: string;
  name: string;
  description: string | null;
  type: string;
  version: string | null;
  fileCount: number;
  existing: { latest_version: string | null } | null;
};
type Preview = {
  repo: string;
  ref: string;
  commit: string | null;
  path: string;
  info: { description: string | null; license: string | null; stars: number; htmlUrl: string; topics: string[] } | null;
  candidates: Candidate[];
};

/** Import a public GitHub repository (or one folder of it) as a rack. */
export function GitHubImport({ username, initialUrl = "" }: { username: string; initialUrl?: string }) {
  const router = useRouter();
  const [url, setUrl] = useState(initialUrl);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [form, setForm] = useState({ name: "", description: "", version: "" });
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState<"lookup" | "import" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function choose(c: Candidate) {
    setSelected(c);
    setForm({ name: c.name, description: c.description ?? "", version: "" });
  }

  async function lookUp(e: React.FormEvent) {
    e.preventDefault();
    setBusy("lookup");
    setError(null);
    setNotice(null);
    setPreview(null);
    setSelected(null);
    try {
      const res = await fetch("/api/v1/import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message ?? "Couldn't read that repository");
      setPreview(data);
      if (data.candidates.length === 1) choose(data.candidates[0]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read that repository");
    } finally {
      setBusy(null);
    }
  }

  async function runImport() {
    if (!preview || !selected) return;
    setBusy("import");
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/v1/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: `https://github.com/${preview.repo}`,
          ref: preview.ref,
          path: selected.path,
          name: form.name,
          description: form.description,
          version: form.version || undefined,
          confirm_rights: rights,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message ?? "Import failed");
      if (data.up_to_date) {
        setNotice(`${data.id} already has this commit as v${data.version}; nothing new to import.`);
        setBusy(null);
        return;
      }
      router.push(`/${data.owner}/${data.name}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
      setBusy(null);
    }
  }

  const willCreate = selected && !selected.existing;
  return (
    <div className="space-y-6">
      <form onSubmit={lookUp} className="space-y-2">
        <label className="block text-sm font-medium" htmlFor="gh-url">
          GitHub repository or folder URL
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <FolderGit2 className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-faint" />
            <input
              id="gh-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              className="input pl-9 font-mono text-sm"
              placeholder="https://github.com/owner/repo/tree/main/skills/my-skill"
              autoFocus
            />
          </div>
          <button disabled={busy !== null} className="btn btn-primary h-9 shrink-0">
            {busy === "lookup" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Look up
          </button>
        </div>
        <p className="text-xs text-muted">
          Public repositories only. Link to the whole repo to see every skill in it, or to one folder (…/tree/branch/path) to import just that.
        </p>
      </form>

      {busy === "lookup" && <p className="text-sm text-muted">Downloading the repository from GitHub…</p>}

      {preview && (
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line bg-subtle px-4 py-3 text-sm">
            <a href={`https://github.com/${preview.repo}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 font-semibold text-accent hover:underline">
              {preview.repo} <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <span className="flex items-center gap-1 font-mono text-xs text-muted">
              <GitCommitHorizontal className="h-3.5 w-3.5" /> {preview.ref}
              {preview.commit && ` @ ${preview.commit.slice(0, 7)}`}
            </span>
            {preview.info && (
              <>
                <span className="flex items-center gap-1 text-xs text-muted">
                  <Star className="h-3.5 w-3.5" /> {preview.info.stars}
                </span>
                {preview.info.license && (
                  <span className="flex items-center gap-1 text-xs text-muted">
                    <Scale className="h-3.5 w-3.5" /> {preview.info.license}
                  </span>
                )}
              </>
            )}
          </div>
          {preview.info?.description && <p className="border-b border-line-muted px-4 py-2 text-sm text-muted">{preview.info.description}</p>}
          <div className="px-4 pt-3 pb-1 text-xs font-semibold tracking-wider text-muted uppercase">
            {preview.candidates.length === 1 ? "Folder to import" : `${preview.candidates.length} folders found — pick one`}
          </div>
          <ul className="max-h-80 divide-y divide-line-muted overflow-y-auto">
            {preview.candidates.map((c) => (
              <li key={c.path}>
                <label className={`flex cursor-pointer items-start gap-3 px-4 py-2.5 ${selected?.path === c.path ? "bg-accent-subtle" : "hover:bg-subtle"}`}>
                  <input type="radio" name="candidate" checked={selected?.path === c.path} onChange={() => choose(c)} className="mt-1 accent-[var(--accent)]" />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-mono text-xs text-muted">{c.path || "(repository root)"}</span>
                      <span className="font-semibold">{c.name}</span>
                      <TypeBadge type={c.type} />
                      <span className="text-xs text-faint">{c.fileCount} files</span>
                      {c.existing && (
                        <span className="rounded-full border border-accent-line px-1.5 text-[0.7rem] text-accent">
                          your rack{c.existing.latest_version ? ` v${c.existing.latest_version}` : ""}
                        </span>
                      )}
                    </span>
                    {c.description && <span className="mt-0.5 line-clamp-2 text-xs text-muted">{c.description}</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      {preview && selected && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[auto_auto_1fr] sm:items-end">
            <Field label="Owner">
              <div className="input flex items-center bg-subtle text-muted">{username}</div>
            </Field>
            <span className="hidden pb-2 text-xl text-faint sm:block">/</span>
            <Field label="Rack name">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value.toLowerCase() })} className="input font-mono" />
            </Field>
          </div>
          <Field label={willCreate ? "Description *" : "Description"} hint={willCreate ? "Becomes the new rack's description." : "Your rack keeps its current description."}>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              maxLength={500}
              required={!!willCreate}
              disabled={!willCreate}
              className="input disabled:opacity-60"
            />
          </Field>
          <Field label="Version" hint={selected.version ? `The repo declares ${selected.version}.` : "Leave blank to use 0.1.0 for a new rack, or the next patch version."}>
            <input value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} className="input max-w-40 font-mono" placeholder={selected.version ?? "auto"} />
          </Field>
          <div className="rounded-md border border-line-muted bg-subtle px-3 py-2 text-xs text-muted">
            {willCreate
              ? `Creates the rack ${username}/${form.name || "…"} and pushes this folder as its first version.`
              : `Adds a new version to your rack ${username}/${form.name}.`}{" "}
            The exact commit is recorded, so you can sync later updates from the rack page.
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} className="mt-1 accent-[var(--accent)]" />
            <span>
              I have the right to publish this code on SkiHost: it&apos;s mine, or its license allows redistribution
              {preview.info?.license ? ` (the repo is ${preview.info.license})` : " (the repo doesn't declare a license — check before importing)"}.
            </span>
          </label>
          <button type="button" onClick={runImport} disabled={busy !== null || !rights || !form.name || (!!willCreate && !form.description.trim())} className="btn btn-primary btn-lg">
            {busy === "import" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderGit2 className="h-4 w-4" />}
            {busy === "import" ? "Importing…" : willCreate ? "Import and create rack" : "Import new version"}
          </button>
        </div>
      )}

      {error && <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      {notice && <p className="rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">{notice}</p>}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </div>
  );
}
