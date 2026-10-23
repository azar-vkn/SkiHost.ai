"use client";

import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUp, Bot, Download, Sparkles, Star, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CommandLine } from "./copy-button";

type AgentPackage = { id: string; type: string; description: string; latest_version: string; downloads: number; stars: number; install: string };
type Msg = { role: "user" | "agent"; text: string; packages?: AgentPackage[]; engine?: string };

const EXAMPLES = [
  "I need a skill that extracts tables from PDF invoices",
  "Find an MCP server for PostgreSQL",
  "requirements for a FastAPI project",
  "How do I publish the skill I just built?",
];

export function AgentChat({ initial }: { initial?: string }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: message }]);
    setBusy(true);
    try {
      const res = await fetch("/api/v1/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message ?? "The marketplace agent is unavailable");
      setMessages((m) => [...m, { role: "agent", text: data.reply, packages: data.packages, engine: data.engine }]);
    } catch (err) {
      setMessages((m) => [...m, { role: "agent", text: `⚠️ ${err instanceof Error ? err.message : "Something went wrong"}` }]);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (initial && !started.current) {
      started.current = true;
      send(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  useEffect(() => {
    // Braces matter: newer browsers return a Promise from scrollIntoView, which an effect must not return.
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  return (
    <div className="card flex h-[calc(100vh-11rem)] min-h-[520px] flex-col overflow-hidden">
      <div className="flex-1 space-y-6 overflow-y-auto p-5 sm:p-6">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-subtle text-accent">
              <Bot className="h-6 w-6" />
            </span>
            <h2 className="mt-4 text-lg font-semibold">Ask the marketplace agent</h2>
            <p className="mt-1 max-w-md text-sm text-muted">
              Describe what you or your agent needs to build. It searches SkiHost and answers with the packages to install — the same answers other
              agents get over A2A, MCP and the CLI.
            </p>
            <div className="mt-6 grid w-full max-w-xl gap-2 sm:grid-cols-2">
              {EXAMPLES.map((e) => (
                <button key={e} onClick={() => send(e)} className="card px-3 py-2.5 text-left text-sm text-muted transition hover:border-accent-line hover:text-fg">
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className="flex gap-3">
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${m.role === "agent" ? "bg-accent text-accent-fg" : "bg-inset text-muted"}`}>
              {m.role === "agent" ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="mb-1 flex items-center gap-2 text-xs text-muted">
                <span className="font-semibold text-fg">{m.role === "agent" ? "SkiHost agent" : "You"}</span>
                {m.engine === "claude" && (
                  <span className="inline-flex items-center gap-1">
                    <Sparkles className="h-3 w-3" /> planned with Claude
                  </span>
                )}
              </div>
              {m.role === "agent" ? (
                <div className="markdown-body text-sm">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>
                </div>
              ) : (
                <p className="text-sm whitespace-pre-wrap">{m.text}</p>
              )}
              {m.packages && m.packages.length > 0 && (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {m.packages.slice(0, 4).map((p) => (
                    <div key={p.id} className="card p-3">
                      <Link href={`/${p.id}`} className="font-semibold text-accent hover:underline">
                        {p.id}
                      </Link>
                      <p className="mt-1 line-clamp-2 text-xs text-muted">{p.description}</p>
                      <div className="mt-2 flex items-center gap-3 text-xs text-faint">
                        <span>{p.type}</span>
                        <span>v{p.latest_version}</span>
                        <span className="inline-flex items-center gap-0.5">
                          <Download className="h-3 w-3" /> {p.downloads}
                        </span>
                        <span className="inline-flex items-center gap-0.5">
                          <Star className="h-3 w-3" /> {p.stars}
                        </span>
                      </div>
                      <div className="mt-2">
                        <CommandLine command={p.install} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-accent-fg">
              <Bot className="h-4 w-4" />
            </span>
            <p className="caret pt-1 text-sm text-muted">Searching the registry</p>
          </div>
        )}
        <div ref={bottom} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="border-t border-line bg-subtle p-3"
      >
        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={2}
            placeholder="What does your agent need to do?"
            className="input resize-none pr-12"
            aria-label="Message the marketplace agent"
          />
          <button disabled={busy || !input.trim()} className="btn btn-primary absolute right-2 bottom-2 h-8 w-8 px-0" aria-label="Send">
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
