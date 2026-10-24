"use client";

import { useState } from "react";
import { FolderGit2, PencilLine } from "lucide-react";
import { NewRackForm } from "./new-rack-form";
import { GitHubImport } from "./github-import";

/** New rack page: start from scratch, or import an existing GitHub repo/folder. */
export function NewRackTabs({ username, importUrl }: { username: string; importUrl?: string }) {
  const [tab, setTab] = useState<"scratch" | "github">(importUrl ? "github" : "scratch");
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-2 rounded-lg border border-line bg-subtle p-1 text-sm font-medium" role="tablist">
        {(
          [
            ["scratch", "Start from scratch", PencilLine],
            ["github", "Import from GitHub", FolderGit2],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`flex items-center justify-center gap-2 rounded-md py-2 ${tab === key ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg"}`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>
      {tab === "scratch" ? <NewRackForm username={username} /> : <GitHubImport username={username} initialUrl={importUrl} />}
    </div>
  );
}
