import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, Bot, Network, Plug, TerminalSquare, Upload } from "lucide-react";
import { type PackageSummary, type Stats } from "@/lib/registry";
import { cachedListing, cachedStats } from "@/lib/cached";
import { compactNumber } from "@/lib/format";
import { siteUrl } from "@/lib/db";
import { SearchBox } from "@/components/search-box";
import { PackageRow } from "@/components/package-row";
import { TYPE_META, TypeIcon } from "@/components/type-badge";
import { CommandLine } from "@/components/copy-button";
import { SetupNotice } from "@/components/setup-notice";

export const dynamic = "force-dynamic";

async function loadHome() {
  try {
    const [stats, popular, fresh] = await Promise.all([cachedStats(), cachedListing("downloads", 6), cachedListing("updated", 6)]);
    return { stats, popular, fresh, error: null };
  } catch (err) {
    return { stats: null, popular: [], fresh: [], error: err instanceof Error ? err.message : "Registry unavailable" };
  }
}

export default async function Home() {
  const [{ stats, popular, fresh, error }, base] = await Promise.all([loadHome(), siteUrl()]);

  return (
    <>
      <section className="relative overflow-hidden border-b border-line">
        <div className="grid-bg absolute inset-0" aria-hidden="true" />
        <div
          className="absolute -top-40 left-1/2 h-[480px] w-[900px] -translate-x-1/2 rounded-full opacity-25 blur-3xl"
          style={{ background: "radial-gradient(closest-side, var(--accent), transparent)" }}
          aria-hidden="true"
        />
        <div className="relative mx-auto grid grid-cols-1 max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:py-24">
          <div>
            <p className="chip mb-5">
              <Bot className="h-3.5 w-3.5" /> The package registry for AI agents
            </p>
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl lg:text-[3.4rem] lg:leading-[1.08]">
              Skills for every agent.
              <br />
              <span className="text-accent">One command away.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted">
              Find, install, pull and publish skills, plugins, MCP servers and requirement files — from a terminal, over MCP,
              agent-to-agent via A2A, or right here in the browser.
            </p>
            <Suspense>
              <SearchBox large className="mt-8 max-w-xl" />
            </Suspense>
            <div className="mt-4 flex flex-wrap gap-2">
              {Object.entries(TYPE_META).slice(0, 5).map(([type, meta]) => (
                <Link key={type} href={`/explore?type=${type}`} className="chip">
                  <TypeIcon type={type} className="h-3 w-3" /> {meta.plural}
                </Link>
              ))}
            </div>
          </div>
          <Terminal base={base} />
        </div>
      </section>

      {stats && <StatsBar stats={stats} />}

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <SectionTitle eyebrow="Agent-native" title="Every agent speaks SkiHost" sub="Pick the door that fits your agent. They all reach the same registry." />
        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Door icon={TerminalSquare} title="CLI" href="/docs#cli" text="A zero-dependency Node CLI with --json on every command. Agents shell out; humans type.">
            <CommandLine command="skihost install owner/name" />
          </Door>
          <Door icon={Plug} title="MCP server" href="/docs#mcp" text="Add SkiHost to Claude, Cursor or any MCP client as tools: search, inspect, fetch files, publish.">
            <CommandLine command={`${base}/api/mcp`} prompt="url" />
          </Door>
          <Door icon={Network} title="A2A agent" href="/docs#a2a" text="Buyer agents message the marketplace agent over Agent2Agent JSON-RPC and get ranked packages back.">
            <CommandLine command="/.well-known/agent-card.json" prompt="GET" />
          </Door>
          <Door icon={Bot} title="REST + llms.txt" href="/docs#api" text="Plain JSON over HTTP with an OpenAPI spec, plus an llms.txt that teaches any model to use the registry.">
            <CommandLine command="/api/v1/search?q=pdf" prompt="GET" />
          </Door>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6">
        {error ? (
          <SetupNotice message={error} />
        ) : (
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <ListCard title="Most downloaded" href="/explore?sort=downloads" items={popular} />
            <ListCard title="Recently updated" href="/explore?sort=updated" items={fresh} />
          </div>
        )}
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <SectionTitle eyebrow="Browse" title="Everything an agent can install" />
        <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(TYPE_META).map(([type, meta]) => (
            <Link key={type} href={`/explore?type=${type}`} className="card group flex items-start gap-3 p-4 transition hover:border-accent-line hover:shadow-card">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-subtle text-accent">
                <TypeIcon type={type} />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-2 font-medium">
                  {meta.plural}
                  {stats?.types?.[type] ? <span className="text-xs text-faint">{stats.types[type]}</span> : null}
                </span>
                <span className="mt-0.5 block text-sm text-muted">{meta.blurb}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="card relative overflow-hidden p-8 sm:p-12">
          <div className="absolute inset-0 opacity-60" style={{ background: "radial-gradient(600px circle at 100% 0%, var(--accent-subtle), transparent)" }} aria-hidden="true" />
          <div className="relative grid items-center gap-8 lg:grid-cols-2">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Built a skill? Give it a rack and push.</h2>
              <p className="mt-3 text-muted">
                A rack is like a GitHub repository: create it once with a description, then every push adds an immutable version with
                a manifest, README and file browser, ready for every other agent to pull. Works from the terminal, over MCP or REST, or here.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/new" className="btn btn-primary btn-lg">
                  <Upload className="h-4 w-4" /> Create a rack
                </Link>
                <Link href="/docs#publish" className="btn btn-lg">
                  Publishing guide <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
            <div className="space-y-2">
              <CommandLine command="skihost login" />
              <CommandLine command={`skihost rack create my-skill --description "…"`} />
              <CommandLine command="skihost init --type skill" />
              <CommandLine command="skihost push --bump patch" />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function Terminal({ base }: { base: string }) {
  const host = base.replace(/^https?:\/\//, "");
  return (
    <div className="card self-center overflow-hidden shadow-card">
      <div className="flex items-center gap-1.5 border-b border-line bg-subtle px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-line" />
        <span className="h-2.5 w-2.5 rounded-full bg-line" />
        <span className="h-2.5 w-2.5 rounded-full bg-line" />
        <span className="ml-3 font-mono text-xs text-faint">agent@workspace — {host}</span>
      </div>
      <pre className="overflow-x-auto bg-code p-5 font-mono text-[0.78rem] leading-relaxed">
        <span className="text-faint"># the agent was asked to build an invoice parser</span>
        {"\n"}
        <span className="text-accent">$</span> skihost ask <span className="text-success">&quot;extract tables from PDF invoices&quot;</span>
        {"\n"}
        <span className="text-muted">Found 2 packages for </span>
        <span className="font-semibold">pdf tables invoices</span>
        {"\n  "}1. <span className="font-semibold text-accent">skihost/pdf-tables</span> <span className="text-faint">skill v1.2.0</span>
        {"\n  "}2. <span className="font-semibold text-accent">skihost/invoice-schema</span> <span className="text-faint">prompt v0.3.1</span>
        {"\n\n"}
        <span className="text-accent">$</span> skihost install skihost/pdf-tables --claude
        {"\n"}
        <span className="text-success">✓</span> installed <span className="font-semibold">skihost/pdf-tables@1.2.0</span> → .claude/skills/pdf-tables
        {"\n  "}
        <span className="text-warning">requirements:</span> pip install pdfplumber pandas
        {"\n\n"}
        <span className="text-accent">$</span> <span className="caret" />
      </pre>
    </div>
  );
}

function StatsBar({ stats }: { stats: Stats }) {
  const items = [
    ["Racks", stats.racks ?? stats.packages],
    ["Versions", stats.versions],
    ["Downloads", stats.downloads],
    ["Publishers", stats.publishers],
  ] as const;
  return (
    <section className="border-b border-line bg-subtle">
      <div className="mx-auto grid max-w-7xl grid-cols-2 divide-line px-4 sm:px-6 md:grid-cols-4 md:divide-x">
        {items.map(([label, value]) => (
          <div key={label} className="px-2 py-6 text-center">
            <div className="text-2xl font-semibold tracking-tight">{compactNumber(value)}</div>
            <div className="mt-1 text-xs tracking-wide text-muted uppercase">{label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SectionTitle({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) {
  return (
    <div>
      <p className="text-xs font-semibold tracking-widest text-accent uppercase">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
      {sub && <p className="mt-2 text-muted">{sub}</p>}
    </div>
  );
}

function Door({
  icon: Icon,
  title,
  text,
  href,
  children,
}: {
  icon: typeof Bot;
  title: string;
  text: string;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card flex flex-col p-5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-subtle text-accent">
          <Icon className="h-4 w-4" />
        </span>
        <h3 className="font-semibold">{title}</h3>
      </div>
      <p className="mt-3 flex-1 text-sm text-muted">{text}</p>
      <div className="mt-4">{children}</div>
      <Link href={href} className="mt-3 inline-flex items-center gap-1 text-sm text-accent hover:underline">
        Learn more <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

function ListCard({ title, href, items }: { title: string; href: string; items: PackageSummary[] }) {
  return (
    <div className="card">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <h2 className="font-semibold">{title}</h2>
        <Link href={href} className="text-sm text-accent hover:underline">
          View all
        </Link>
      </div>
      <div className="px-5">
        {items.length ? (
          items.map((p) => <PackageRow key={`${p.owner}/${p.name}`} pkg={p} compact />)
        ) : (
          <p className="py-10 text-center text-sm text-muted">
            Nothing here yet. <Link href="/new" className="text-accent hover:underline">Create the first rack</Link>.
          </p>
        )}
      </div>
    </div>
  );
}
