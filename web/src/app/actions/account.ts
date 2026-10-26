"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { siteUrl } from "@/lib/db";
import { safeNext } from "@/lib/safe-next";
import { rateLimit } from "@/lib/rate-limit";

export type FormState = { error?: string; notice?: string } | undefined;
export type EnrollState = { error?: string; factorId?: string; qr?: string; secret?: string; done?: boolean } | undefined;

async function limitedMfa() {
  try {
    await rateLimit(await headers(), "login");
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : "Too many attempts";
  }
}

/** Second step of sign-in for accounts with an authenticator app. */
export async function verifyMfaCode(_prev: FormState, form: FormData): Promise<FormState> {
  const code = String(form.get("code") ?? "").replace(/\s/g, "");
  const next = safeNext(form.get("next"));
  if (!/^\d{6}$/.test(code)) return { error: "Enter the 6-digit code from your authenticator app." };
  const tooMany = await limitedMfa();
  if (tooMany) return { error: tooMany };
  const db = await createClient();
  const { data: factors, error: listError } = await db.auth.mfa.listFactors();
  if (listError) return { error: listError.message };
  const factor = factors.totp.find((f) => f.status === "verified");
  if (!factor) redirect(next);
  const { error } = await db.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  if (error) return { error: "That code didn't work. Check your device's clock and try the newest code." };
  revalidatePath("/", "layout");
  redirect(next);
}

/** Starts authenticator-app enrolment: returns the QR code to scan. */
export async function startMfaEnrollment(): Promise<EnrollState> {
  const db = await createClient();
  const { data: factors } = await db.auth.mfa.listFactors();
  // Abandoned enrolments leave unverified factors behind; clear them before starting again.
  for (const f of factors?.all ?? []) if (f.status === "unverified") await db.auth.mfa.unenroll({ factorId: f.id });
  if (factors?.totp.some((f) => f.status === "verified")) return { error: "Two-factor authentication is already on." };
  const { data, error } = await db.auth.mfa.enroll({ factorType: "totp", friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}` });
  if (error) return { error: error.message };
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

export async function confirmMfaEnrollment(prev: EnrollState, form: FormData): Promise<EnrollState> {
  const code = String(form.get("code") ?? "").replace(/\s/g, "");
  const factorId = String(form.get("factorId") ?? "");
  if (!/^\d{6}$/.test(code)) return { ...prev, error: "Enter the 6-digit code shown in your authenticator app." };
  const tooMany = await limitedMfa();
  if (tooMany) return { ...prev, error: tooMany };
  const db = await createClient();
  const { error } = await db.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) return { ...prev, error: "That code didn't match. Make sure you scanned the QR code shown here, then try the newest code." };
  revalidatePath("/settings/security");
  return { done: true };
}

export async function disableMfa(form: FormData) {
  const db = await createClient();
  const { error } = await db.auth.mfa.unenroll({ factorId: String(form.get("factorId") ?? "") });
  if (error) redirect(`/settings/security?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/settings/security");
  redirect("/settings/security?notice=" + encodeURIComponent("Two-factor authentication is off."));
}

export async function changeEmail(_prev: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address." };
  const db = await createClient();
  const { error } = await db.auth.updateUser(
    { email },
    { emailRedirectTo: `${await siteUrl()}/auth/callback?next=${encodeURIComponent("/settings/security")}` },
  );
  if (error) return { error: error.message };
  return { notice: `Confirmation links were sent to your current address and to ${email}. The change applies once you open them.` };
}

// Same limits as the profiles_*_check constraints (migration 0009) and the settings form.
const PROFILE_LIMITS = { displayName: 60, bio: 300, website: 200 } as const;

/** Display name, bio and website shown on the public profile page. */
export async function updateProfile(_prev: FormState, form: FormData): Promise<FormState> {
  const displayName = String(form.get("display_name") ?? "").trim();
  const bio = String(form.get("bio") ?? "").trim().replace(/\r\n/g, "\n");
  let website = String(form.get("website") ?? "").trim();

  if (displayName.length > PROFILE_LIMITS.displayName) return { error: `Display name can be at most ${PROFILE_LIMITS.displayName} characters.` };
  if (/[\x00-\x1f\x7f]/.test(displayName)) return { error: "Display name can't contain control characters." };
  if (bio.length > PROFILE_LIMITS.bio) return { error: `Bio can be at most ${PROFILE_LIMITS.bio} characters.` };
  if (/[\x00-\x09\x0b-\x1f\x7f]/.test(bio)) return { error: "Bio can't contain control characters." };
  if (website) {
    if (!/^[a-z][a-z0-9+.-]*:/i.test(website)) website = `https://${website}`;
    let url: URL;
    try {
      url = new URL(website);
    } catch {
      return { error: "Enter a valid website address, like https://example.com." };
    }
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname.includes(".") || /\s/.test(website)) {
      return { error: "Website must be an http or https address, like https://example.com." };
    }
    if (website.length > PROFILE_LIMITS.website) return { error: `Website can be at most ${PROFILE_LIMITS.website} characters.` };
  }

  try {
    await rateLimit(await headers(), "write");
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Too many requests" };
  }
  const db = await createClient();
  const { data: auth, error: claimsError } = await db.auth.getClaims();
  if (claimsError && claimsError.name !== "AuthSessionMissingError" && !/jwt|session|token/i.test(claimsError.message))
    return { error: "Couldn't reach the sign-in service just now. Try again in a moment." };
  if (!auth?.claims?.sub) return { error: "Your session expired. Sign in again." };
  const { data, error } = await db
    .from("profiles")
    .update({ display_name: displayName || null, bio: bio || null, website: website || null })
    .eq("user_id", auth.claims.sub)
    .select("username")
    .maybeSingle();
  if (error || !data) return { error: error?.message ?? "Could not save your profile." };
  revalidatePath(`/${data.username}`);
  revalidatePath("/settings/profile");
  return { notice: "Profile saved." };
}

export async function deleteAccount(_prev: FormState, form: FormData): Promise<FormState> {
  const db = await createClient();
  const { error } = await db.rpc("delete_my_account", { p_confirm: String(form.get("confirm") ?? "").trim() });
  if (error) {
    if (error.message === "confirmation_mismatch") return { error: "Type your username exactly to confirm." };
    if (error.message === "mfa_required") return { error: "Complete your two-factor code check first." };
    return { error: error.message };
  }
  await db.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/?deleted=1");
}
