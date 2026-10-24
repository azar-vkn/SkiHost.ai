"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { siteUrl } from "@/lib/db";
import { safeNext } from "@/lib/safe-next";
import { rateLimit, type Bucket } from "@/lib/rate-limit";

export type AuthState = { error?: string; notice?: string } | undefined;

const USERNAME_RE = /^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/;
const MIN_PASSWORD = 10;

/** Rate-limit a form action by client IP (and optionally a second key such as the email). */
async function limited(bucket: Bucket, key?: string): Promise<string | null> {
  try {
    const h = await headers();
    await rateLimit(h, bucket);
    if (key) await rateLimit(h, bucket, key);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : "Too many requests";
  }
}

/** Where Supabase sends people back to after Google, email confirmation or a reset link. */
async function callbackUrl(next: string) {
  return `${await siteUrl()}/auth/callback?next=${encodeURIComponent(next)}`;
}

export async function signIn(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const next = safeNext(form.get("next"));
  const tooMany = await limited("login", `email:${email.toLowerCase()}`);
  if (tooMany) return { error: tooMany };
  const db = await createClient();
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.code === "email_not_confirmed") return { error: "Confirm your email first: open the link we sent you, then sign in." };
    return { error: error.message };
  }
  const { data: profile } = await db.from("profiles").select("onboarded").eq("user_id", data.user.id).maybeSingle();
  revalidatePath("/", "layout");
  redirect(profile && !profile.onboarded ? `/welcome?next=${encodeURIComponent(next)}` : next);
}

export async function signUp(_prev: AuthState, form: FormData): Promise<AuthState> {
  const username = String(form.get("username") ?? "").trim().toLowerCase();
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!USERNAME_RE.test(username))
    return { error: "Username must be 1–39 lowercase letters, digits or single hyphens, not starting or ending with a hyphen." };
  if (password.length < MIN_PASSWORD) return { error: `Password must be at least ${MIN_PASSWORD} characters.` };
  if (form.get("terms") !== "on") return { error: "Please accept the Terms of Service and Acceptable Use Policy." };
  const tooMany = await limited("signup");
  if (tooMany) return { error: tooMany };

  const db = await createClient();
  const { data: available, error: availError } = await db.rpc("username_available", { p_username: username });
  if (availError) return { error: "Registry database is not set up yet. Run `npm run db:migrate`." };
  if (!available) return { error: `The username "${username}" is taken or reserved.` };

  const { data, error } = await db.auth.signUp({
    email,
    password,
    // The confirmation link lands on /auth/callback, which signs the user in and continues to their tokens page.
    options: { data: { username, display_name: username, accepted_terms: true }, emailRedirectTo: await callbackUrl("/settings/tokens?welcome=1") },
  });
  if (error) return { error: error.message };
  if (!data.session) return { notice: `Almost there: we sent a confirmation link to ${email}. Open it to finish signing up.` };
  revalidatePath("/", "layout");
  redirect("/settings/tokens?welcome=1");
}

/** "Continue with Google": hands the browser to Supabase, which returns to /auth/callback. */
export async function signInWithGoogle(form: FormData) {
  const next = safeNext(form.get("next"));
  const tooMany = await limited("login");
  if (tooMany) redirect(`/login?error=${encodeURIComponent(tooMany)}`);
  const db = await createClient();
  const { data, error } = await db.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: await callbackUrl(next), queryParams: { prompt: "select_account" } },
  });
  if (error || !data.url) redirect(`/login?error=${encodeURIComponent(error?.message ?? "Google sign-in is unavailable")}`);
  redirect(data.url);
}

export async function requestPasswordReset(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim();
  if (!email) return { error: "Enter the email you signed up with." };
  const tooMany = await limited("reset", `email:${email.toLowerCase()}`);
  if (tooMany) return { error: tooMany };
  const db = await createClient();
  const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: await callbackUrl("/reset-password") });
  if (error && error.status === 429) return { error: "Too many requests. Wait a minute and try again." };
  // Same answer whether or not the address has an account, so this can't be used to probe for users.
  return { notice: `If ${email} has a SkiHost account, a link to choose a new password is on its way.` };
}

export async function updatePassword(_prev: AuthState, form: FormData): Promise<AuthState> {
  const password = String(form.get("password") ?? "");
  if (password.length < MIN_PASSWORD) return { error: `Password must be at least ${MIN_PASSWORD} characters.` };
  if (password !== String(form.get("confirm") ?? "")) return { error: "The two passwords don't match." };
  const tooMany = await limited("reset");
  if (tooMany) return { error: tooMany };
  const db = await createClient();
  const { error } = await db.auth.updateUser({ password });
  if (error) return { error: error.code === "same_password" ? "That's already your password; choose a different one." : error.message };
  return { notice: "Password updated. You can use it to sign in from now on, including from the CLI." };
}

export async function completeOnboarding(_prev: AuthState, form: FormData): Promise<AuthState> {
  const username = String(form.get("username") ?? "").trim().toLowerCase();
  const next = safeNext(form.get("next"));
  if (form.get("terms") !== "on") return { error: "Please accept the Terms of Service and Acceptable Use Policy." };
  const db = await createClient();
  const { error } = await db.rpc("complete_onboarding", { p_username: username });
  if (error) {
    const messages: Record<string, string> = {
      invalid_username: `"${username}" isn't available as a username. Use 1–39 lowercase letters, digits or single hyphens; a few names (like welcome, api or docs) are reserved for SkiHost pages.`,
      username_taken: `The username "${username}" is taken.`,
      has_racks: "You already own racks, so your username can't change any more.",
      auth_required: "Your session expired. Sign in again.",
    };
    return { error: messages[error.message] ?? error.message };
  }
  revalidatePath("/", "layout");
  redirect(next === "/" ? "/settings/tokens?welcome=1" : next);
}

export async function signOut() {
  const db = await createClient();
  await db.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}
