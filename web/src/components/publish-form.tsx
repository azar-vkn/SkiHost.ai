"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { FileArchive, FolderUp, PencilLine, Upload, X } from "lucide-react";
import { TYPE_META } from "./type-badge";

const SKILL_TEMPLATE = (name: string, description: string) => `---
name: ${name || "my-skill"}
description: ${description || "What this skill does and when an agent should use it"}
---

# ${name || "my-skill"}

## When to use

Describe the tasks this skill helps with.

## Instructions

1. Step-by-step instructions the agent should follow.
2. Reference any scripts bundled with the skill.
`;

type Mode = "upload" | "write";

export interface RackRef {
  owner: string;
  name: string;
  type: string;
  description: string;
  latestVersion: string | null;
}

/** Push a new version into an existing rack, by uploading files or writing them here. */
export function PublishForm({ rack }: { rack: RackRef }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("upload");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const folderInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const [meta, setMeta] = useState({ name: rack.name, version: "", type: rack.type, description: rack.description, keywords: "", license: "MIT", pip: "", npm: "", env: "" });
  const [skillMd, setSkillMd] = useState("");
  const [readme, setReadme] = useState("");
  const set = (k: keyof typeof meta) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setMeta({ ...meta, [k]: e.target.value });
  const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const form = new FormData();
    if (mode === "upload") {
      if (!files.length) return setError("Choose a folder, a .zip, or some files first.");
      const zip = files.length === 1 && files[0].name.toLowerCase().endsWith(".zip") ? files[0] : null;
      if (zip) form.append("archive", zip);
      else for (const f of files) form.append("files", f, (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name);
      if (meta.version.trim()) form.append("manifest", JSON.stringify({ version: meta.version.trim() }));
    } else {
      const manifest = {
        name: meta.name.trim().toLowerCase(),
        version: meta.version.trim() || (rack.latestVersion ? bumpPatch(rack.latestVersion) : "0.1.0"),
        type: meta.type,
        description: meta.description.trim(),
        keywords: list(meta.keywords),
        license: meta.license.trim() || undefined,
        agents: ["any"],
        requirements: { pip: list(meta.pip), npm: list(meta.npm), env: list(meta.env) },
      };
      const body = meta.type === "skill" ? skillMd || SKILL_TEMPLATE(manifest.name, manifest.description) : null;
      form.append("manifest", JSON.stringify(manifest));
      form.append("files", new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" }), "skihost.json");
      if (body) form.append("files", new Blob([body], { type: "text/markdown" }), "SKILL.md");
      form.append("files", new Blob([readme || `# ${manifest.name}\n\n${manifest.description}\n`], { type: "text/markdown" }), "README.md");
    }
    setBusy(true);
    try {
      // ?name= pins the push to this rack whatever name the uploaded manifest carries.
      const res = await fetch(`/api/v1/publish?name=${encodeURIComponent(rack.name)}`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message ?? "Publish failed");
      router.push(`/${data.owner}/${data.name}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish failed");
      setBusy(false);
    }
  }

  function addFiles(list: FileList | null) {
    if (list) setFiles(Array.from(list));
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="grid grid-cols-2 gap-2 rounded-lg border border-line bg-subtle p-1 text-sm font-medium">
        {(["upload", "write"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`flex items-center justify-center gap-2 rounded-md py-2 ${mode === m ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg"}`}
          >
            {m === "upload" ? <FolderUp className="h-4 w-4" /> : <PencilLine className="h-4 w-4" />}
            {m === "upload" ? "Upload folder or zip" : "Write it here"}
          </button>
        ))}
      </div>

      {mode === "upload" ? (
        <div className="space-y-4">
          <div
            onDragOver={(e) => (e.preventDefault(), setDragging(true))}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              addFiles(e.dataTransfer.files);
            }}
            className={`card flex flex-col items-center justify-center border-dashed p-10 text-center transition ${dragging ? "border-accent bg-accent-subtle" : ""}`}
          >
            <Upload className="h-8 w-8 text-accent" />
            <p className="mt-3 font-medium">Drop a .zip or files here</p>
            <p className="mt-1 text-sm text-muted">
              The package needs a <code>skihost.json</code> or a <code>SKILL.md</code> with <code>name</code> and <code>description</code> front matter.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <button type="button" className="btn" onClick={() => folderInput.current?.click()}>
                <FolderUp className="h-4 w-4" /> Choose folder
              </button>
              <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
                <FileArchive className="h-4 w-4" /> Choose .zip or files
              </button>
            </div>
            <input
              ref={folderInput}
              type="file"
              className="hidden"
              multiple
              onChange={(e) => addFiles(e.target.files)}
              {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
            />
            <input ref={fileInput} type="file" className="hidden" multiple onChange={(e) => addFiles(e.target.files)} />
          </div>
          {files.length > 0 && (
            <div className="card">
              <div className="flex items-center justify-between border-b border-line px-4 py-2 text-sm">
                <span className="font-medium">
                  {files.length} file{files.length > 1 ? "s" : ""} selected
                </span>
                <button type="button" onClick={() => setFiles([])} className="text-muted hover:text-fg" aria-label="Clear files">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <ul className="max-h-48 overflow-auto px-4 py-2 font-mono text-xs text-muted">
                {files.slice(0, 200).map((f, i) => (
                  <li key={i} className="truncate py-0.5">
                    {(f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Field label="Version" hint="Overrides the version in skihost.json. Leave blank to use the manifest's. The files are pushed to this rack whatever name the manifest has.">
            <input value={meta.version} onChange={set("version")} className="input max-w-40 font-mono" placeholder="1.0.0" />
          </Field>
        </div>
      ) : (
        <div className="space-y-5">
          <Field label="Version" hint={rack.latestVersion ? `Latest is ${rack.latestVersion}` : "This will be the rack's first version"}>
            <input
              value={meta.version}
              onChange={set("version")}
              className="input max-w-40 font-mono"
              placeholder={rack.latestVersion ? bumpPatch(rack.latestVersion) : "0.1.0"}
            />
          </Field>
          <Field label="Type">
            <select value={meta.type} onChange={set("type")} className="input">
              {Object.entries(TYPE_META).map(([t, m]) => (
                <option key={t} value={t}>
                  {m.label} — {m.blurb}
                </option>
              ))}
            </select>
          </Field>
          <Field label="License">
            <input value={meta.license} onChange={set("license")} className="input max-w-60" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="pip requirements">
              <input value={meta.pip} onChange={set("pip")} className="input font-mono text-xs" placeholder="pdfplumber>=0.11" />
            </Field>
            <Field label="npm requirements">
              <input value={meta.npm} onChange={set("npm")} className="input font-mono text-xs" placeholder="zod" />
            </Field>
            <Field label="Env vars needed">
              <input value={meta.env} onChange={set("env")} className="input font-mono text-xs" placeholder="OPENAI_API_KEY" />
            </Field>
          </div>
          {meta.type === "skill" && (
            <Field label="SKILL.md" hint="The instructions an agent loads. Leave empty to start from a template.">
              <textarea
                value={skillMd}
                onChange={(e) => setSkillMd(e.target.value)}
                rows={14}
                className="input font-mono text-xs"
                placeholder={SKILL_TEMPLATE(meta.name, meta.description)}
              />
            </Field>
          )}
          <Field label="README.md" hint="Shown on the package page for humans.">
            <textarea value={readme} onChange={(e) => setReadme(e.target.value)} rows={8} className="input font-mono text-xs" placeholder={`# ${meta.name || "my-package"}\n\nWhat it does, how to use it, examples…`} />
          </Field>
        </div>
      )}

      {error && <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      <div className="flex items-center justify-between gap-4 border-t border-line pt-5">
        <p className="text-xs text-muted">Published versions are immutable. Secrets like .env files are never uploaded.</p>
        <button disabled={busy} className="btn btn-primary btn-lg shrink-0">
          <Upload className="h-4 w-4" /> {busy ? "Pushing…" : "Push version"}
        </button>
      </div>
    </form>
  );
}

function bumpPatch(v: string) {
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)/);
  return m ? `${m[1]}.${m[2]}.${Number(m[3]) + 1}` : "0.1.0";
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
