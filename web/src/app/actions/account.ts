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
