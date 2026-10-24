"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  completeOnboarding,
  requestPasswordReset,
  signIn,
  signInWithGoogle,
  signUp,
  updatePassword,
  type AuthState,
} from "@/app/actions/auth";
import { LogoMark } from "./logo";

export function AuthForm({ mode, next, google, error }: { mode: "login" | "signup"; next?: string; google: boolean; error?: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(mode === "login" ? signIn : signUp, undefined);
  const isLogin = mode === "login";

  return (
    <AuthShell
      title={isLogin ? "Sign in to SkiHost" : "Create your SkiHost account"}
      subtitle={isLogin ? "Create racks, push versions, star favourites and manage API tokens." : "One account for the website, the CLI and your agents."}
      footer={
        isLogin ? (
          <>
            New to SkiHost? <Link href="/signup" className="text-accent hover:underline">Create an account</Link>
          </>
        ) : (
          <>
            Already have an account? <Link href="/login" className="text-accent hover:underline">Sign in</Link>
          </>
        )
      }
    >
      {google && (
        <>
          <form action={signInWithGoogle}>
            {next && <input type="hidden" name="next" value={next} />}
            <GoogleButton label={isLogin ? "Continue with Google" : "Sign up with Google"} />
          </form>
          <div className="flex items-center gap-3 text-xs text-faint">
            <span className="h-px flex-1 bg-line" /> or with email <span className="h-px flex-1 bg-line" />
          </div>
        </>
      )}
      <form action={action} className="space-y-4">
        {next && <input type="hidden" name="next" value={next} />}
        {!isLogin && (
          <Field label="Username" hint="Your namespace: skihost install username/rack">
            <input name="username" required autoComplete="username" pattern="[a-z0-9](?:[a-z0-9\-]{0,37}[a-z0-9])?" className="input" placeholder="ada-lovelace" />
          </Field>
        )}
        <Field label="Email">
          <input name="email" type="email" required autoComplete="email" className="input" />
        </Field>
        <Field
          label="Password"
          hint={isLogin ? undefined : "At least 10 characters"}
          action={
            isLogin ? (
              <Link href="/forgot-password" className="text-xs text-accent hover:underline">
                Forgot password?
              </Link>
            ) : undefined
          }
        >
          <input name="password" type="password" required minLength={isLogin ? undefined : 10} autoComplete={isLogin ? "current-password" : "new-password"} className="input" />
        </Field>
        {!isLogin && <TermsCheckbox />}
        <Messages state={state} error={error} />
        <button disabled={pending} className="btn btn-primary w-full">
          {pending ? "Please wait…" : isLogin ? "Sign in" : "Create account"}
        </button>
      </form>
    </AuthShell>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(requestPasswordReset, undefined);
  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your account's email and we'll send you a link to choose a new password."
      footer={
        <>
          Remembered it? <Link href="/login" className="text-accent hover:underline">Sign in</Link>
        </>
      }
    >
      <form action={action} className="space-y-4">
        <Field label="Email">
          <input name="email" type="email" required autoComplete="email" className="input" />
        </Field>
        <Messages state={state} />
        <button disabled={pending} className="btn btn-primary w-full">
          {pending ? "Sending…" : "Send reset link"}
        </button>
      </form>
    </AuthShell>
  );
}

export function ResetPasswordForm({ email, hasPassword }: { email: string; hasPassword: boolean }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(updatePassword, undefined);
  return (
    <AuthShell
      title={hasPassword ? "Choose a new password" : "Set a password"}
      subtitle={
        hasPassword
          ? `For ${email}.`
          : `For ${email}. You signed up with Google; a password also lets you run \`skihost login\` with your email.`
      }
      footer={
        <Link href="/settings/tokens" className="text-accent hover:underline">
          Back to your settings
        </Link>
      }
    >
      <form action={action} className="space-y-4">
        <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
        <Field label="New password" hint="At least 10 characters">
          <input name="password" type="password" required minLength={10} autoComplete="new-password" className="input" />
        </Field>
        <Field label="Confirm new password">
          <input name="confirm" type="password" required minLength={10} autoComplete="new-password" className="input" />
        </Field>
        <Messages state={state} />
        <button disabled={pending} className="btn btn-primary w-full">
          {pending ? "Saving…" : "Save password"}
        </button>
      </form>
    </AuthShell>
  );
}

export function WelcomeForm({ username, displayName, next }: { username: string; displayName: string | null; next: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(completeOnboarding, undefined);
  return (
    <AuthShell
      title={`Welcome${displayName ? `, ${displayName.split(" ")[0]}` : ""}! 🎿`}
      subtitle="Pick the username for your SkiHost namespace. It appears in every rack you create and every install command."
    >
      <form action={action} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <Field label="Username" hint="Lowercase letters, digits and hyphens. You can't change it once you own a rack.">
          <input
            name="username"
            required
            defaultValue={username}
            pattern="[a-z0-9](?:[a-z0-9\-]{0,37}[a-z0-9])?"
            className="input font-mono"
            autoFocus
          />
        </Field>
        <TermsCheckbox />
        <Messages state={state} />
        <button disabled={pending} className="btn btn-primary w-full">
          {pending ? "Saving…" : "Continue"}
        </button>
      </form>
    </AuthShell>
  );
}

function TermsCheckbox() {
  return (
    <label className="flex items-start gap-2 text-xs text-muted">
      <input type="checkbox" name="terms" required className="mt-0.5 accent-[var(--accent)]" />
      <span>
        I agree to the{" "}
        <Link href="/terms" target="_blank" className="text-accent hover:underline">
          Terms of Service and Acceptable Use Policy
        </Link>{" "}
        and the{" "}
        <Link href="/privacy" target="_blank" className="text-accent hover:underline">
          Privacy Policy
        </Link>
        .
      </span>
    </label>
  );
}

function AuthShell({ title, subtitle, footer, children }: { title: string; subtitle: string; footer?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center px-4 py-16">
      <LogoMark className="h-11 w-11" />
      <h1 className="mt-5 text-center text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 text-center text-sm text-muted">{subtitle}</p>
      <div className="card mt-8 w-full space-y-4 p-5">{children}</div>
      {footer && <p className="card mt-4 w-full p-4 text-center text-sm text-muted">{footer}</p>}
    </div>
  );
}

function GoogleButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className="btn btn-lg w-full gap-3 bg-surface">
      <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" aria-hidden="true">
        <path fill="#4285F4" d="M23.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.45a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.57-5.17 3.57-8.65Z" />
        <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.9l-3.88-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.95H1.27v3.1A12 12 0 0 0 12 24Z" />
        <path fill="#FBBC05" d="M5.27 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1Z" />
        <path fill="#EA4335" d="M12 4.75c1.76 0 3.35.6 4.6 1.8l3.44-3.44A11.97 11.97 0 0 0 1.27 6.6l4 3.1C6.22 6.86 8.87 4.75 12 4.75Z" />
      </svg>
      {pending ? "Redirecting to Google…" : label}
    </button>
  );
}

function Messages({ state, error }: { state: AuthState; error?: string }) {
  const err = state?.error ?? (state?.notice ? undefined : error);
  return (
    <>
      {err && <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{err}</p>}
      {state?.notice && <p className="rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">{state.notice}</p>}
    </>
  );
}

function Field({ label, hint, action, children }: { label: string; hint?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between text-sm font-medium">
        {label}
        {action}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}
