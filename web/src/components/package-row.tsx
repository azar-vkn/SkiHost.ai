import Link from "next/link";
import { Download, Star } from "lucide-react";
import type { PackageSummary } from "@/lib/registry";
import { compactNumber, timeAgo } from "@/lib/format";
import { TypeBadge, TypeIcon } from "./type-badge";

/**
 * One package in a list, laid out like a repository row on GitHub. Descriptions are clamped to two
 * lines so rows stay a predictable height (the full text is on the rack page); `compact` also trims
 * the topics, for side-by-side lists like the home page's.
 */
export function PackageRow({ pkg, showOwner = true, compact = false }: { pkg: PackageSummary; showOwner?: boolean; compact?: boolean }) {
  const topics = pkg.keywords.slice(0, compact ? 3 : 6);
  return (
    <article className={`flex gap-4 border-b border-line-muted last:border-b-0 ${compact ? "py-4" : "py-5"}`}>
      <div className="mt-0.5 hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-subtle text-accent sm:flex">
        <TypeIcon type={pkg.type} />
      </div>
      <div className="min-w-0 flex-1">
        <div className={`flex items-center gap-x-2 gap-y-1 ${compact ? "flex-nowrap [&>*:not(a)]:shrink-0" : "flex-wrap"}`}>
          <Link
            href={`/${pkg.owner}/${pkg.name}`}
            title={`${pkg.owner}/${pkg.name}`}
            className="min-w-0 truncate text-[1.02rem] font-semibold text-accent hover:underline"
          >
            {showOwner && <span className="font-normal">{pkg.owner} / </span>}
            {pkg.name}
          </Link>
          <TypeBadge type={pkg.type} />
          {pkg.latest_version ? (
            <span className="font-mono text-xs text-faint">v{pkg.latest_version}</span>
          ) : (
            <span className="rounded-full border border-warning/50 px-1.5 text-[0.7rem] text-warning">empty</span>
          )}
        </div>
        {/* Compact rows reserve two description lines and one topic line, so side-by-side lists line up. */}
        <p className={`mt-1.5 line-clamp-2 text-sm text-muted ${compact ? "min-h-10" : ""}`} title={pkg.description}>
          {pkg.description}
        </p>
        {(topics.length > 0 || compact) && (
          <div className={`mt-2.5 flex gap-1.5 ${compact ? "h-6 flex-nowrap overflow-hidden" : "flex-wrap"}`}>
            {topics.map((k) => (
              <Link key={k} href={`/explore?q=${encodeURIComponent(k)}`} className="chip">
                {k}
              </Link>
            ))}
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
          <span className="inline-flex items-center gap-1">
            <Download className="h-3.5 w-3.5" /> {compactNumber(pkg.downloads)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Star className="h-3.5 w-3.5" /> {compactNumber(pkg.stars)}
          </span>
          <span>Updated {timeAgo(pkg.updated_at)}</span>
        </div>
      </div>
    </article>
  );
}
