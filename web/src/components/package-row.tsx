import Link from "next/link";
import { Download, Star } from "lucide-react";
import type { PackageSummary } from "@/lib/registry";
import { compactNumber, timeAgo } from "@/lib/format";
import { TypeBadge, TypeIcon } from "./type-badge";

/** One package in a list, laid out like a repository row on GitHub. */
export function PackageRow({ pkg, showOwner = true }: { pkg: PackageSummary; showOwner?: boolean }) {
  return (
    <article className="flex gap-4 border-b border-line-muted py-5 last:border-b-0">
      <div className="mt-0.5 hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-subtle text-accent sm:flex">
        <TypeIcon type={pkg.type} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link href={`/${pkg.owner}/${pkg.name}`} className="text-[1.02rem] font-semibold text-accent hover:underline">
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
        <p className="mt-1.5 text-sm text-muted">{pkg.description}</p>
        {pkg.keywords.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {pkg.keywords.slice(0, 6).map((k) => (
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
