"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

export function CopyButton({ text, className = "", label }: { text: string; className?: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }
  return (
    <button
      type="button"
      onClick={copy}
      className={`inline-flex items-center gap-1.5 rounded-md p-1.5 text-muted transition hover:bg-inset hover:text-fg ${className}`}
      aria-label={copied ? "Copied" : `Copy ${label ?? ""}`.trim()}
      title={copied ? "Copied!" : "Copy"}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
      {label && <span className="text-xs">{copied ? "Copied" : label}</span>}
    </button>
  );
}

/** A one-line shell command with a copy button, the building block of every install snippet. */
export function CommandLine({ command, prompt = "$" }: { command: string; prompt?: string }) {
  return (
    <div className="group flex items-center gap-2 rounded-md border border-line-muted bg-code py-1.5 pr-1 pl-3 font-mono text-[0.8rem]">
      <span className="select-none text-faint">{prompt}</span>
      <code className="no-scrollbar min-w-0 flex-1 overflow-x-auto whitespace-nowrap text-fg" title={command}>
        {command}
      </code>
      <CopyButton text={command} />
    </div>
  );
}
