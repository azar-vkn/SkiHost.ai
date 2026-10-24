import { errorResponse, json, preflight } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { requestDb } from "@/lib/db";
import { RegistryError, whoami } from "@/lib/registry";

export const OPTIONS = preflight;

export async function GET(req: Request) {
  try {
    await rateLimit(req.headers, "read");
    const { db, token } = await requestDb(req);
    const me = await whoami(db, token);
    if (!me) throw new RegistryError("Not signed in", 401, "auth_required");
    return json(me);
  } catch (err) {
    return errorResponse(err);
  }
}
