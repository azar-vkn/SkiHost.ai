import { errorResponse, json, preflight } from "@/lib/http";
import { requestDb } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { yankVersion } from "@/lib/registry";

type Ctx = { params: Promise<{ owner: string; name: string; version: string }> };

export const OPTIONS = preflight;

/** Yank a version (owner or admin): `{ "reason": "..." }`. Exact installs still work; "latest" skips it. */
export async function POST(req: Request, { params }: Ctx) {
  return toggle(req, params, true);
}

/** Restore a yanked version. */
export async function DELETE(req: Request, { params }: Ctx) {
  return toggle(req, params, false);
}

async function toggle(req: Request, params: Ctx["params"], yank: boolean) {
  try {
    await rateLimit(req.headers, "write");
    const { owner, name, version } = await params;
    const { db, token } = await requestDb(req);
    const body = yank ? ((await req.json().catch(() => ({}))) as { reason?: string }) : {};
    return json(await yankVersion(db, token, owner, name, version, body.reason ?? null, yank));
  } catch (err) {
    return errorResponse(err);
  }
}
