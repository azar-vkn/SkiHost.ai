"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Boxes } from "lucide-react";
import { TYPE_META } from "./type-badge";

/** GitHub's "Create a new repository", for racks. Optionally pushes a starter v0.1.0. */
export function NewRackForm({ username }: { username: string }) {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", description: "", type: "skill", topics: "", homepage: "", repository: "" });
  const [starter, setStarter] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: k === "name" ? e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, "-") : e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/racks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, keywords: form.topics.split(",").map((t) => t.trim()).filter(Boolean) }),
      });
      const rack = await res.json();
      if (!res.ok) throw new Error(rack.error?.message ?? "Could not create the rack");

      if (starter) {
        const manifest = { name: rack.name, version: "0.1.0", type: form.type, description: form.description, agents: ["any"] };
        const files: Record<string, string> = {
          "skihost.json": JSON.stringify(manifest, null, 2) + "\n",
          "README.md": `# ${rack.name}\n\n${form.description}\n\n## Install\n\n\`\`\`bash\nskihost install ${rack.owner}/${rack.name}\n\`\`\`\n`,
        };
        if (form.type === "skill") {
          files["SKILL.md"] = `---\nname: ${rack.name}\ndescription: ${form.description}\n---\n\n# ${rack.name}\n\n## When to use\n\nDescribe the tasks this skill helps with.\n\n## Instructions\n\n1. Step-by-step instructions the agent should follow.\n`;
        }
        const pub = await fetch("/api/v1/publish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ manifest, files }),
        });
        if (!pub.ok) throw new Error((await pub.json()).error?.message ?? "Rack created, but the starter version failed");
      }
      router.push(`/${rack.owner}/${rack.name}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-[auto_auto_1fr] sm:items-end">
        <Field label="Owner">
          <div className="input flex items-center bg-subtle text-muted">{username}</div>
        </Field>
        <span className="hidden pb-2 text-xl text-faint sm:block">/</span>
        <Field label="Rack name *">
          <input
            value={form.name}
            onChange={set("name")}
            required
            maxLength={64}
            pattern="[a-z0-9](?:[a-z0-9._\-]{0,62}[a-z0-9])?"
            className="input font-mono"
            placeholder="pdf-tables"
            autoFocus
          />
        </Field>
      </div>
      <p className="-mt-3 text-xs text-muted">
        Great rack names are short and say what&apos;s inside. Agents will install it as{" "}
        <code className="text-fg">
          {username}/{form.name || "rack-name"}
        </code>
        .
      </p>

      <Field label="Description *" hint="What it does and when an agent should use it. Agents search and rank racks by this.">
        <textarea value={form.description} onChange={set("description")} required rows={3} maxLength={500} className="input" />
      </Field>

      <Field label="What will this rack hold?">
        <div className="grid gap-2 sm:grid-cols-2">
          {Object.entries(TYPE_META).map(([t, m]) => {
            const Icon = m.icon;
            return (
              <label
                key={t}
                className={`card flex cursor-pointer items-start gap-3 p-3 transition ${form.type === t ? "border-accent bg-accent-subtle" : "hover:border-accent-line"}`}
              >
                <input type="radio" name="type" value={t} checked={form.type === t} onChange={set("type")} className="sr-only" />
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                <span>
                  <span className="block text-sm font-medium">{m.label}</span>
                  <span className="block text-xs text-muted">{m.blurb}</span>
                </span>
              </label>
            );
          })}
        </div>
      </Field>

      <Field label="Topics" hint="Comma separated, e.g. pdf, tables, extraction">
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

      <label className="card flex cursor-pointer items-start gap-3 p-4">
        <input type="checkbox" checked={starter} onChange={(e) => setStarter(e.target.checked)} className="mt-1 accent-[var(--accent)]" />
        <span>
          <span className="block text-sm font-medium">Add a starter version (v0.1.0)</span>
          <span className="block text-xs text-muted">
            Pushes a README.md and skihost.json{form.type === "skill" ? " plus a SKILL.md template" : ""}, so the rack is installable right away. Leave it off
            to push your own files first.
          </span>
        </span>
      </label>

      {error && <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      <div className="border-t border-line pt-5">
        <button disabled={busy} className="btn btn-primary btn-lg">
          <Boxes className="h-4 w-4" /> {busy ? "Creating…" : "Create rack"}
        </button>
      </div>
    </form>
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
