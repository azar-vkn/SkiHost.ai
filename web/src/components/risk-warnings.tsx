import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { RISK_FLAGS, type RiskFlag } from "@/lib/security-scan";

/** What SkiHost's scanner noticed in a version, shown before anyone installs it. */
export function RiskWarnings({ flags }: { flags: string[] }) {
  if (!flags.length) return null;
  return (
    <div className="rounded-lg border border-warning/50 bg-warning/10 p-4 text-sm">
      <p className="flex items-center gap-2 font-semibold text-warning">
        <AlertTriangle className="h-4 w-4" /> Review before installing
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-6 text-muted">
        {flags.map((f) => (
          <li key={f}>{RISK_FLAGS[f as RiskFlag] ?? f}</li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted">
        Automated checks, not a verdict: legitimate tools can trigger them, and their absence doesn&apos;t prove a package is safe.{" "}
        <Link href="/security" className="text-accent hover:underline">
          Installing safely
        </Link>
      </p>
    </div>
  );
}
