"use client";

import { useState } from "react";
import type { installInfo } from "@/lib/install";
import { CommandLine, CopyButton } from "./copy-button";

type Info = ReturnType<typeof installInfo>;

/** Install instructions for each kind of consumer: terminal, Claude Code, another agent, MCP, or a plain download. */
export function InstallPanel({ info, base }: { info: Info; base: string }) {
  const tabs = ["CLI", "Claude Code", "For agents", ...(info.mcp_config ? ["MCP"] : []), "Download"] as const;
  const [tab, setTab] = useState<(typeof tabs)[number]>("CLI");

  const agentPrompt = `Install the SkiHost package ${info.id}@${info.version}.
If the \`skihost\` CLI is available, run: ${info.claude_code}
Otherwise fetch every file as JSON from ${info.files_url}
and write each { path, content } under ${info.claude_path}/.${
    info.requirements.length ? `\nThen install its requirements: ${info.requirements.join(" && ")}` : ""
  }`;

  return (
    <div className="card overflow-hidden">
      <div className="flex overflow-x-auto border-b border-line bg-subtle text-xs font-medium" role="tablist">
        {tabs.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`shrink-0 border-b-2 px-3 py-2.5 ${tab === t ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg"}`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="space-y-2 p-3">
        {tab === "CLI" && (
          <>
            <CommandLine command={info.cli} />
            <p className="text-xs text-muted">
              Installs into <code className="text-fg">{info.default_path}</code> and records it in skihost.lock.json. Pin with{" "}
              <code className="text-fg">@{info.version}</code>.
            </p>
            <p className="pt-1 text-xs text-muted">No CLI yet?</p>
            <CommandLine command={`curl -fsSL ${base}/install.sh | sh`} />
            <CommandLine command={`irm ${base}/install.ps1 | iex`} prompt="PS>" />
          </>
        )}
        {tab === "Claude Code" && (
          <>
            <CommandLine command={info.claude_code} />
            <p className="text-xs text-muted">
              Drops the package into <code className="text-fg">{info.claude_path}</code> where Claude Code discovers it. Add{" "}
              <code className="text-fg">--global</code> for <code className="text-fg">~/.claude</code>.
            </p>
          </>
        )}
        {tab === "For agents" && (
          <>
            <div className="relative">
              <pre className="max-h-56 overflow-auto rounded-md border border-line-muted bg-code p-3 pr-9 font-mono text-[0.72rem] leading-relaxed whitespace-pre-wrap">
                {agentPrompt}
              </pre>
              <CopyButton text={agentPrompt} className="absolute top-1.5 right-1.5" />
            </div>
            <p className="text-xs text-muted">Paste this into any agent&apos;s task. It works with or without the CLI.</p>
          </>
        )}
        {tab === "MCP" && info.mcp_config && (
          <div className="relative">
            <pre className="overflow-auto rounded-md border border-line-muted bg-code p-3 font-mono text-[0.72rem]">
              {JSON.stringify(info.mcp_config, null, 2)}
            </pre>
            <CopyButton text={JSON.stringify(info.mcp_config, null, 2)} className="absolute top-1.5 right-1.5" />
          </div>
        )}
        {tab === "Download" && (
          <>
            <a href={info.download_url} className="btn btn-primary w-full">
              Download {info.id.split("/")[1]}-{info.version}.zip
            </a>
            <CommandLine command={info.curl} />
            <CommandLine command={info.powershell} prompt="PS>" />
          </>
        )}
        {info.requirements.length > 0 && tab !== "MCP" && (
          <div className="border-t border-line-muted pt-2">
            <p className="mb-1.5 text-xs font-medium text-warning">Requirements</p>
            {info.requirements.map((r) => (
              <CommandLine key={r} command={r} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
