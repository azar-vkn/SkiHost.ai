"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/** Header search with GitHub's "/" shortcut. */
export function SearchBox({ className = "", large = false }: { className?: string; large?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  // `?q=` means a search query only on /explore (the agent page uses it for a chat prompt).
  const pathname = usePathname();
  const [q, setQ] = useState(pathname === "/explore" ? (params.get("q") ?? "") : "");
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (large) return;
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !["INPUT", "TEXTAREA"].includes(t.tagName) && !t.isContentEditable) {
        e.preventDefault();
        ref.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [large]);

  return (
    <form
      role="search"
      className={`relative ${className}`}
      onSubmit={(e) => {
        e.preventDefault();
        router.push(`/explore${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`);
      }}
    >
      <Search className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-faint ${large ? "left-4 h-5 w-5" : "left-2.5 h-4 w-4"}`} />
      <input
        ref={ref}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={large ? "Search skills, plugins, MCP servers…  e.g. “pdf tables”" : "Search SkiHost"}
        aria-label="Search packages"
        className={`input ${large ? "h-13 rounded-xl pl-12 text-base shadow-card" : "h-8 bg-subtle pl-8 pr-8 text-sm"}`}
      />
      {!large && <span className="kbd absolute top-1/2 right-2 -translate-y-1/2">/</span>}
    </form>
  );
}
