"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

export type TokenState = { error?: string; token?: string; name?: string } | undefined;

export async function createToken(_prev: TokenState, form: FormData): Promise<TokenState> {
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { error: "Give the token a name, like \"laptop\" or \"research-agent\"." };
  const db = await createClient();
  const { data, error } = await db.rpc("create_api_token", { p_name: name });
  if (error) return { error: error.message === "auth_required" ? "Sign in again to create a token." : error.message };
  revalidatePath("/settings/tokens");
  return { token: data.token, name: data.name };
}

export async function revokeToken(form: FormData) {
  const db = await createClient();
  await db.rpc("revoke_api_token", { p_id: String(form.get("id")) });
  revalidatePath("/settings/tokens");
}
