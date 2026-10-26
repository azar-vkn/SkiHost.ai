"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { updateProfile, type FormState } from "@/app/actions/account";

const LIMITS = { displayName: 60, bio: 300, website: 200 };

export function ProfileForm({
  username,
  displayName,
  bio,
  website,
}: {
  username: string;
  displayName: string;
  bio: string;
  website: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateProfile, undefined);
  const [name, setName] = useState(displayName);
  const [about, setAbout] = useState(bio);
  // Controlled so a rejected save keeps what was typed (React resets uncontrolled fields after an action).
  const [site, setSite] = useState(website);

  return (
    <form action={action} className="space-y-5">
      <Field label="Display name" hint={`${name.length}/${LIMITS.displayName}`} htmlFor="display_name">
        <input
          id="display_name"
          name="display_name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={LIMITS.displayName}
          placeholder={username}
          autoComplete="name"
          className="input"
        />
        <p className="mt-1.5 text-xs text-muted">Shown on your profile and racks. Leave empty to show your username.</p>
      </Field>

      <Field label="Bio" hint={`${about.length}/${LIMITS.bio}`} htmlFor="bio">
        <textarea
          id="bio"
          name="bio"
          value={about}
          onChange={(e) => setAbout(e.target.value)}
          maxLength={LIMITS.bio}
          rows={4}
          placeholder="What you build, and what your racks are for"
          className="input h-auto py-2"
        />
      </Field>

      <Field label="Website" htmlFor="website">
        <input
          id="website"
          name="website"
          type="text"
          inputMode="url"
          value={site}
          onChange={(e) => setSite(e.target.value)}
          maxLength={LIMITS.website}
          placeholder="https://example.com"
          autoComplete="url"
          className="input"
        />
      </Field>

      <div>
        <span className="mb-1.5 block text-sm font-medium">Username</span>
        <p className="text-sm text-muted">
          <code className="text-fg">{username}</code>. Your username is part of every rack&apos;s address, so it can&apos;t be changed.
        </p>
      </div>

      {state?.error && <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{state.error}</p>}
      {state?.notice && (
        <p className="rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
          {state.notice}{" "}
          <Link href={`/${username}`} className="underline">
            View your profile
          </Link>
        </p>
      )}
      <button disabled={pending} className="btn btn-primary">
        {pending ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}

function Field({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <label htmlFor={htmlFor} className="text-sm font-medium">
          {label}
        </label>
        {hint && <span className="text-xs text-faint">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
