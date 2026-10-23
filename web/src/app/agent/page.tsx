import type { Metadata } from "next";
import { siteUrl } from "@/lib/db";
import { AgentChat } from "@/components/agent-chat";
import { CommandLine } from "@/components/copy-button";

export const metadata: Metadata = { title: "Marketplace agent" };

export default async function AgentPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [{ q }, base] = await Promise.all([searchParams, siteUrl()]);
  const a2a = `curl -s ${base}/api/a2a -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"message/send","params":{"message":{"role":"user","messageId":"m1","parts":[{"kind":"text","text":"pdf table extraction"}]}}}'`;
  return (
    <div className="mx-auto grid grid-cols-1 max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_340px]">
      <AgentChat initial={q} />
      <aside className="space-y-5 text-sm">
        <div>
          <h2 className="font-semibold">Connect your own agent</h2>
          <p className="mt-1 text-muted">This chat is a window onto the marketplace agent. Agents reach the same brain programmatically:</p>
        </div>
        <Section title="A2A (Agent2Agent)">
          <CommandLine command={`${base}/.well-known/agent-card.json`} prompt="card" />
          <div className="relative">
            <pre className="max-h-40 overflow-auto rounded-md border border-line-muted bg-code p-2.5 font-mono text-[0.68rem] whitespace-pre-wrap text-muted">{a2a}</pre>
          </div>
        </Section>
        <Section title="CLI">
          <CommandLine command={`skihost ask "find an MCP server for postgres" --json`} />
        </Section>
        <Section title="MCP tool">
          <CommandLine command={`${base}/api/mcp`} prompt="url" />
          <p className="text-xs text-muted">
            Call the <code>ask_marketplace</code> tool with <code>{`{ "message": "…" }`}</code>.
          </p>
        </Section>
        <Section title="REST">
          <CommandLine command={`POST ${base}/api/v1/agent {"message":"…"}`} prompt="" />
        </Section>
      </aside>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold tracking-wider text-muted uppercase">{title}</h3>
      {children}
    </div>
  );
}
