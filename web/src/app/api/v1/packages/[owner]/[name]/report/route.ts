import { errorResponse, json, preflight } from "@/lib/http";
import { requestDb } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { reportPackage, REPORT_REASONS, RegistryError } from "@/lib/registry";

type Ctx = { params: Promise<{ owner: string; name: string }> };

export const OPTIONS = preflight;

/** Report a rack to moderators: `{ "reason": "malware" | "secrets" | ..., "details": "..." }`. Needs an account. */
export async function POST(req: Request, { params }: Ctx) {
  try {
    await rateLimit(req.headers, "write");
    const { owner, name } = await params;
    const { db, token } = await requestDb(req);
    const body = (await req.json().catch(() => ({}))) as { reason?: string; details?: string };
    if (!body.reason || !(body.reason in REPORT_REASONS))
      throw new RegistryError(`reason must be one of: ${Object.keys(REPORT_REASONS).join(", ")}`, 400, "invalid_request");
    return json(await reportPackage(db, token, owner, name, body.reason, body.details?.slice(0, 2000) ?? null), { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
