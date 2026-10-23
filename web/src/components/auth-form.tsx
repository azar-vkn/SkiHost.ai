"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn, signUp, type AuthState } from "@/app/actions/auth";
import { LogoMark } from "./logo";

export function AuthForm({ mode, next }: { mode: "login" | "signup"; next?: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(mode === "login" ? signIn : signUp, undefined);
  const isLogin = mode === "login";

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center px-4 py-16">
      <LogoMark className="h-11 w-11" />
      <h1 className="mt-5 text-2xl font-semibold tracking-tight">{isLogin ? "Sign in to SkiHost" : "Create your SkiHost account"}</h1>
      <p className="mt-1 text-center text-sm text-muted">
        {isLogin ? "Publish packages, star favourites and create API tokens." : "One account for the website, the CLI and your agents."}
      </p>

      <form action={action} className="card mt-8 w-full space-y-4 p-5">
        {next && <input type="hidden" name="next" value={next} />}
        {!isLogin && (
          <Field label="Username" hint="Your namespace: skihost install username/package">
            <input name="username" required autoComplete="username" pattern="[a-z0-9](?:[a-z0-9\-]{0,37}[a-z0-9])?" className="input" placeholder="ada-lovelace" />
          </Field>
        )}
        <Field label="Email">
          <input name="email" type="email" required autoComplete="email" className="input" />
        </Field>
        <Field label="Password" hint={isLogin ? undefined : "At least 8 characters"}>
          <input name="password" type="password" required minLength={isLogin ? undefined : 8} autoComplete={isLogin ? "current-password" : "new-password"} className="input" />
        </Field>
        {state?.error && <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{state.error}</p>}
        {state?.notice && <p className="rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">{state.notice}</p>}
        <button disabled={pending} className="btn btn-primary w-full">
          {pending ? "Please wait…" : isLogin ? "Sign in" : "Create account"}
        </button>
      </form>

      <p className="card mt-4 w-full p-4 text-center text-sm text-muted">
        {isLogin ? (
          <>
            New to SkiHost? <Link href="/signup" className="text-accent hover:underline">Create an account</Link>
          </>
        ) : (
          <>
            Already have an account? <Link href="/login" className="text-accent hover:underline">Sign in</Link>
          </>
        )}
      </p>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}
