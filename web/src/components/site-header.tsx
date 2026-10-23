import Link from "next/link";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import { getCurrentProfile } from "@/lib/session";
import { Logo } from "./logo";
import { SearchBox } from "./search-box";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

const NAV = [
  { href: "/explore", label: "Explore" },
  { href: "/agent", label: "Agent" },
  { href: "/docs", label: "Docs" },
  { href: "/docs#cli", label: "CLI" },
];

export async function SiteHeader() {
  const me = await getCurrentProfile();
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-header/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="SkiHost home" className="shrink-0">
          <Logo />
        </Link>
        <Suspense fallback={<div className="hidden w-72 md:block" />}>
          <SearchBox className="hidden w-72 md:block lg:w-80" />
        </Suspense>
        <nav className="hidden items-center gap-1 text-sm font-medium lg:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-md px-2.5 py-1.5 text-muted transition hover:bg-inset hover:text-fg">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <ThemeToggle />
          {me ? (
            <>
              <Link href="/new" className="btn hidden sm:inline-flex" title="Create a new rack">
                <Plus className="h-4 w-4" /> New rack
              </Link>
              <UserMenu username={me.username} />
            </>
          ) : (
            <>
              <Link href="/login" className="btn btn-ghost">
                Sign in
              </Link>
              <Link href="/signup" className="btn btn-primary">
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto border-t border-line-muted px-4 py-1.5 text-sm lg:hidden">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className="rounded-md px-2.5 py-1 text-muted hover:bg-inset hover:text-fg">
            {n.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

export function SiteFooter() {
  const cols = [
    { title: "Registry", links: [["Explore", "/explore"], ["Skills", "/explore?type=skill"], ["MCP servers", "/explore?type=mcp-server"], ["New rack", "/new"]] },
    { title: "For agents", links: [["Marketplace agent", "/agent"], ["MCP endpoint", "/docs#mcp"], ["A2A agent card", "/.well-known/agent-card.json"], ["llms.txt", "/llms.txt"]] },
    { title: "Developers", links: [["CLI", "/docs#cli"], ["REST API", "/docs#api"], ["OpenAPI", "/openapi.json"], ["Package format", "/docs#manifest"]] },
  ];
  return (
    <footer className="mt-24 border-t border-line bg-subtle">
      <div className="mx-auto grid grid-cols-1 max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-4">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm text-muted">The open registry where AI agents and humans share skills, plugins and requirement files.</p>
        </div>
        {cols.map((col) => (
          <div key={col.title}>
            <h3 className="text-sm font-semibold">{col.title}</h3>
            <ul className="mt-3 space-y-2 text-sm">
              {col.links.map(([label, href]) => (
                <li key={href}>
                  <a href={href} className="text-muted hover:text-accent">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line-muted py-5 text-center text-xs text-faint">© {new Date().getFullYear()} SkiHost</div>
    </footer>
  );
}
