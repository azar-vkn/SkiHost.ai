import { createAnonClient } from "@/utils/supabase/server";
import { errorResponse, json, preflight } from "@/lib/http";
import { RegistryError } from "@/lib/registry";

export const OPTIONS = preflight;

/**
 * Exchange email + password for a SkiHost API token (what `skihost login` does).
 * The password is only used for this one sign-in; the CLI stores the token, never the password.
 */
export async function POST(req: Request) {
  try {
    const { email, password, token_name } = (await req.json()) as {
      email?: string;
      password?: string;
      token_name?: string;
    };
    if (!email || !password) throw new RegistryError("email and password are required", 400, "invalid_request");

    const db = createAnonClient();
    const { error: authError } = await db.auth.signInWithPassword({ email, password });
    if (authError) throw new RegistryError(authError.message, 401, "invalid_credentials");

    const { data, error } = await db.rpc("create_api_token", { p_name: token_name || "skihost-cli" });
    if (error) throw new RegistryError(error.message, 500);
    const { data: me } = await db.rpc("whoami", { p_token: null });
    await db.auth.signOut();

    return json({ token: data.token, token_id: data.id, username: me?.username ?? null });
  } catch (err) {
    return errorResponse(err);
  }
}
