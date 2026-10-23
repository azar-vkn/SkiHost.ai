"use client";

import { GitBranch } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function VersionSelect({ versions, current, latest }: { versions: string[]; current: string; latest: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <label className="btn relative gap-1.5 pr-2">
      <GitBranch className="h-3.5 w-3.5 text-muted" />
      <select
        aria-label="Version"
        value={current}
        onChange={(e) => {
          const next = new URLSearchParams(params);
          if (e.target.value === latest) next.delete("v");
          else next.set("v", e.target.value);
          next.delete("path");
          router.push(`${pathname}?${next}`);
        }}
        className="cursor-pointer appearance-none bg-transparent pr-1 font-mono text-xs outline-none"
      >
        {versions.map((v) => (
          <option key={v} value={v} className="bg-surface">
            v{v}
            {v === latest ? " (latest)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
