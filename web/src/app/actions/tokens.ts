"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

export type TokenState = { error?: string; token?: string; name?: string } | undefined;

export async function createToken(_prev: TokenState, form: FormData): Promise<TokenState> {
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { error: "Give the token a name, like \"laptop\" or \"research-agent\"." };
  const days = Number(form.get("expires") ?? 90);
  const db = await createClient();
  const { data, error } = await db.rpc("create_api_token", { p_name: name, p_expires_in_days: days > 0 ? days : null });
  if (error) {
    const messages: Record<string, string> = {
      auth_required: "Sign in again to create a token.",
      mfa_required: "Complete your two-factor code check first.",
      token_limit: "You have 50 active tokens. Revoke some before creating more.",
      rate_limited: "You've created a lot of tokens recently. Try again in an hour.",
    };
    return { error: messages[error.message] ?? error.message };
  }
  revalidatePath("/settings/tokens");
  return { token: data.token, name: data.name };
}

export async function revokeToken(form: FormData) {
  const db = await createClient();
  await db.rpc("revoke_api_token", { p_id: String(form.get("id")) });
  revalidatePath("/settings/tokens");
}
