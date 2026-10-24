import { createAnonClient } from "@/utils/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { errorResponse, json, preflight } from "@/lib/http";
import { RegistryError } from "@/lib/registry";

export const OPTIONS = preflight;

/**
 * Exchange email + password for a SkiHost API token (what `skihost login` does).
 * The password is only used for this one sign-in; the CLI stores the token, never the password.
 */
export async function POST(req: Request) {
  try {
    await rateLimit(req.headers, "login");
    const { email, password, token_name } = (await req.json()) as {
      email?: string;
      password?: string;
      token_name?: string;
    };
    if (!email || !password) throw new RegistryError("email and password are required", 400, "invalid_request");
    // Also limit per account, so guessing one person's password from many IPs is slow too.
    await rateLimit(req.headers, "login", `email:${email.trim().toLowerCase()}`);

    const db = createAnonClient();
    const { error: authError } = await db.auth.signInWithPassword({ email, password });
    if (authError) throw new RegistryError(authError.message, 401, "invalid_credentials");

    const { data, error } = await db.rpc("create_api_token", { p_name: token_name || "skihost-cli", p_expires_in_days: 180 });
    if (error) throw new RegistryError(error.message, 500);
    const { data: me } = await db.rpc("whoami", { p_token: null });
    await db.auth.signOut();

    return json({ token: data.token, token_id: data.id, username: me?.username ?? null });
  } catch (err) {
    return errorResponse(err);
  }
}
