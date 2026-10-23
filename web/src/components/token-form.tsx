"use client";

import { useActionState } from "react";
import { KeyRound } from "lucide-react";
import { createToken, type TokenState } from "@/app/actions/tokens";
import { CommandLine } from "./copy-button";

export function TokenForm({ base }: { base: string }) {
  const [state, action, pending] = useActionState<TokenState, FormData>(createToken, undefined);
  return (
    <div className="space-y-4">
      <form action={action} className="flex gap-2">
        <input name="name" placeholder="Token name, e.g. laptop or research-agent" className="input" maxLength={80} required />
        <button disabled={pending} className="btn btn-primary shrink-0">
          <KeyRound className="h-4 w-4" /> {pending ? "Creating…" : "Generate token"}
        </button>
      </form>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      {state?.token && (
        <div className="card space-y-3 border-success/50 p-4">
          <p className="text-sm">
            <span className="font-semibold text-success">Token “{state.name}” created.</span> Copy it now — it won&apos;t be shown again.
          </p>
          <CommandLine command={state.token} prompt="🔑" />
          <p className="text-xs text-muted">Use it from a terminal or give it to an agent:</p>
          <CommandLine command={`skihost login --registry ${base} --token ${state.token}`} />
          <CommandLine command={`export SKIHOST_TOKEN=${state.token}`} />
        </div>
      )}
    </div>
  );
}
