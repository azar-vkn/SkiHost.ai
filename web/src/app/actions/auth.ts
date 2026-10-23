"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { siteUrl } from "@/lib/db";

export type AuthState = { error?: string; notice?: string } | undefined;

const USERNAME_RE = /^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/;

export async function signIn(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const next = safeNext(form.get("next"));
  const db = await createClient();
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  redirect(next);
}

export async function signUp(_prev: AuthState, form: FormData): Promise<AuthState> {
  const username = String(form.get("username") ?? "").trim().toLowerCase();
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!USERNAME_RE.test(username))
    return { error: "Username must be 1–39 lowercase letters, digits or single hyphens, not starting or ending with a hyphen." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  const db = await createClient();
  const { data: available, error: availError } = await db.rpc("username_available", { p_username: username });
  if (availError) return { error: "Registry database is not set up yet. Run `npm run db:migrate`." };
  if (!available) return { error: `The username "${username}" is taken or reserved.` };

  const { data, error } = await db.auth.signUp({
    email,
    password,
    options: { data: { username, display_name: username }, emailRedirectTo: `${await siteUrl()}/login` },
  });
  if (error) return { error: error.message };
  if (!data.session) return { notice: `Check ${email} for a confirmation link, then sign in.` };
  revalidatePath("/", "layout");
  redirect("/settings/tokens?welcome=1");
}

export async function signOut() {
  const db = await createClient();
  await db.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}

function safeNext(v: FormDataEntryValue | null) {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/";
}
