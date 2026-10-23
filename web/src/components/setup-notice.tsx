import { Database } from "lucide-react";

/** Shown instead of data while the Supabase schema has not been migrated yet. */
export function SetupNotice({ message }: { message: string }) {
  return (
    <div className="card flex items-start gap-3 border-warning/40 bg-subtle p-4 text-sm">
      <Database className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
      <div>
        <p className="font-medium">The registry database isn&apos;t ready</p>
        <p className="mt-1 text-muted">{message}</p>
        <p className="mt-2 font-mono text-xs text-muted">cd web && npm run db:migrate && npm run db:seed</p>
      </div>
    </div>
  );
}
