"use client";

import { useActionState, useState } from "react";
import { ShieldCheck, Trash2 } from "lucide-react";
import {
  changeEmail,
  confirmMfaEnrollment,
  deleteAccount,
  startMfaEnrollment,
  verifyMfaCode,
  type EnrollState,
  type FormState,
} from "@/app/actions/account";

export function MfaCodeForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(verifyMfaCode, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Authentication code</span>
        <input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]{6,7}"
          maxLength={7}
          required
          autoFocus
          className="input text-center font-mono text-lg tracking-[0.4em]"
          placeholder="000000"
        />
      </label>
      <Message state={state} />
      <button disabled={pending} className="btn btn-primary w-full">
        {pending ? "Checking…" : "Verify"}
      </button>
    </form>
  );
}

export function MfaEnroll() {
  const [enroll, setEnroll] = useState<EnrollState>(undefined);
  const [starting, setStarting] = useState(false);
  const [state, action, pending] = useActionState<EnrollState, FormData>(confirmMfaEnrollment, undefined);
  const current = state?.done ? state : (state ?? enroll);

  if (current?.done) {
    return (
      <p className="flex items-center gap-2 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
        <ShieldCheck className="h-4 w-4" /> Two-factor authentication is on. You&apos;ll be asked for a code when you sign in.
      </p>
    );
  }
  if (!enroll?.factorId) {
    return (
      <div className="space-y-2">
        <button
          onClick={async () => {
            setStarting(true);
            setEnroll(await startMfaEnrollment());
            setStarting(false);
          }}
          disabled={starting}
          className="btn btn-primary"
        >
          <ShieldCheck className="h-4 w-4" /> {starting ? "Preparing…" : "Turn on two-factor authentication"}
        </button>
        {enroll?.error && <p className="text-sm text-danger">{enroll.error}</p>}
      </div>
    );
  }
  return (
    <div className="grid gap-5 sm:grid-cols-[180px_1fr]">
      {/* Supabase returns the QR code as an SVG data URI. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={enroll.qr} alt="QR code to scan with your authenticator app" className="h-44 w-44 rounded-md bg-white p-2" />
      <form action={action} className="space-y-3">
        <input type="hidden" name="factorId" value={enroll.factorId} />
        <p className="text-sm text-muted">
          Scan the code with an authenticator app (1Password, Google Authenticator, Authy…), then enter the 6-digit code it shows.
        </p>
        <details className="text-xs text-muted">
          <summary className="cursor-pointer">Can&apos;t scan? Enter this key instead</summary>
          <code className="mt-1 block break-all text-fg">{enroll.secret}</code>
        </details>
        <input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required className="input max-w-40 text-center font-mono tracking-widest" placeholder="000000" />
        {current?.error && <p className="text-sm text-danger">{current.error}</p>}
        <button disabled={pending} className="btn btn-primary">
          {pending ? "Verifying…" : "Verify and turn on"}
        </button>
      </form>
    </div>
  );
}

export function ChangeEmailForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(changeEmail, undefined);
  return (
    <form action={action} className="flex flex-wrap gap-2">
      <input name="email" type="email" required defaultValue={email} className="input max-w-sm" />
      <button disabled={pending} className="btn">
        {pending ? "Sending…" : "Change email"}
      </button>
      <div className="w-full">
        <Message state={state} />
      </div>
    </form>
  );
}

export function DeleteAccountForm({ username }: { username: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(deleteAccount, undefined);
  return (
    <form action={action} className="space-y-3">
      <p className="text-sm text-muted">
        This permanently deletes your account, every rack you own with all its versions, your stars and your API tokens. Agents that
        install your racks will stop finding them. It can&apos;t be undone.
      </p>
      <label className="block text-sm">
        Type <code className="text-fg">{username}</code> to confirm
        <input name="confirm" required autoComplete="off" className="input mt-1.5 max-w-sm" />
      </label>
      <Message state={state} />
      <button disabled={pending} className="btn border-danger/50 text-danger hover:border-danger">
        <Trash2 className="h-4 w-4" /> {pending ? "Deleting…" : "Delete my account"}
      </button>
    </form>
  );
}

function Message({ state }: { state: FormState }) {
  if (state?.error) return <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{state.error}</p>;
  if (state?.notice) return <p className="rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">{state.notice}</p>;
  return null;
}
