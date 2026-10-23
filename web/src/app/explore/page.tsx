import Link from "next/link";
import type { Metadata } from "next";
import { Suspense } from "react";
import { createAnonClient } from "@/utils/supabase/server";
import { searchPackages } from "@/lib/registry";
import { PACKAGE_TYPES } from "@/lib/package-format";
import { PackageRow } from "@/components/package-row";
import { SearchBox } from "@/components/search-box";
import { TYPE_META, TypeIcon } from "@/components/type-badge";
import { SetupNotice } from "@/components/setup-notice";

export const metadata: Metadata = { title: "Explore" };
export const dynamic = "force-dynamic";

const SORTS = [
  ["relevance", "Best match"],
  ["downloads", "Most downloaded"],
  ["stars", "Most starred"],
  ["updated", "Recently updated"],
  ["new", "Newest"],
] as const;
const PAGE = 20;

type SP = Promise<{ q?: string; type?: string; sort?: string; page?: string }>;

export default async function Explore({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const q = sp.q?.trim() || "";
  const type = PACKAGE_TYPES.includes(sp.type as never) ? sp.type! : "";
  const sort = SORTS.some(([s]) => s === sp.sort) ? sp.sort! : q ? "relevance" : "downloads";
  const page = Math.max(1, Number(sp.page) || 1);

  let data: Awaited<ReturnType<typeof searchPackages>> | null = null;
  let error: string | null = null;
  try {
    data = await searchPackages(createAnonClient(), { q, type, sort, limit: PAGE, offset: (page - 1) * PAGE });
  } catch (err) {
    error = err instanceof Error ? err.message : "Search failed";
  }

  const href = (patch: Record<string, string | number | null>) => {
    const next = new URLSearchParams();
    const merged = { q, type, sort, page: String(page), ...patch } as Record<string, string | number | null>;
    for (const [k, v] of Object.entries(merged)) if (v && !(k === "page" && v === "1")) next.set(k, String(v));
    const s = next.toString();
    return `/explore${s ? `?${s}` : ""}`;
  };
  const pages = data ? Math.ceil(data.total / PAGE) : 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[240px_1fr]">
        <aside className="space-y-6">
          <div>
            <h2 className="px-2 text-xs font-semibold tracking-wider text-muted uppercase">Type</h2>
            <nav className="mt-2 space-y-0.5 text-sm">
              <FilterLink href={href({ type: null, page: null })} active={!type}>
                All racks
              </FilterLink>
              {PACKAGE_TYPES.map((t) => (
                <FilterLink key={t} href={href({ type: t, page: null })} active={type === t}>
                  <TypeIcon type={t} className="h-4 w-4" /> {TYPE_META[t].plural}
                </FilterLink>
              ))}
            </nav>
          </div>
          <div>
            <h2 className="px-2 text-xs font-semibold tracking-wider text-muted uppercase">Sort</h2>
            <nav className="mt-2 space-y-0.5 text-sm">
              {SORTS.filter(([s]) => q || s !== "relevance").map(([s, label]) => (
                <FilterLink key={s} href={href({ sort: s, page: null })} active={sort === s}>
                  {label}
                </FilterLink>
              ))}
            </nav>
          </div>
        </aside>

        <section className="min-w-0">
          <Suspense>
            <SearchBox large className="mb-6" />
          </Suspense>
          {error ? (
            <SetupNotice message={error} />
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-line pb-3">
                <p className="text-sm text-muted">
                  <span className="font-semibold text-fg">{data!.total.toLocaleString()}</span> {data!.total === 1 ? "rack" : "racks"}
                  {q && (
                    <>
                      {" "}
                      matching <span className="font-semibold text-fg">“{q}”</span>
                    </>
                  )}
                  {type && <> in {TYPE_META[type].plural.toLowerCase()}</>}
                </p>
                {(q || type) && (
                  <Link href="/explore" className="text-sm text-accent hover:underline">
                    Clear filters
                  </Link>
                )}
              </div>
              {data!.results.length ? (
                data!.results.map((p) => <PackageRow key={`${p.owner}/${p.name}`} pkg={p} />)
              ) : (
                <div className="py-16 text-center">
                  <p className="text-lg font-medium">No racks found</p>
                  <p className="mt-1 text-sm text-muted">
                    Try different keywords, ask the <Link href={`/agent?q=${encodeURIComponent(q)}`} className="text-accent hover:underline">marketplace agent</Link>, or{" "}
                    <Link href="/new" className="text-accent hover:underline">create one</Link>.
                  </p>
                </div>
              )}
              {pages > 1 && (
                <nav className="mt-6 flex items-center justify-center gap-2" aria-label="Pagination">
                  {page > 1 && (
                    <Link href={href({ page: page - 1 })} className="btn">
                      Previous
                    </Link>
                  )}
                  <span className="px-2 text-sm text-muted">
                    Page {page} of {pages}
                  </span>
                  {page < pages && (
                    <Link href={href({ page: page + 1 })} className="btn">
                      Next
                    </Link>
                  )}
                </nav>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function FilterLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${active ? "bg-accent-subtle font-medium text-accent" : "text-muted hover:bg-inset hover:text-fg"}`}
    >
      {children}
    </Link>
  );
}
