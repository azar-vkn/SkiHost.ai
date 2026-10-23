import { errorResponse, json, preflight } from "@/lib/http";
import { requestDb } from "@/lib/db";
import { setStar } from "@/lib/registry";

type Ctx = { params: Promise<{ owner: string; name: string }> };

export const OPTIONS = preflight;

export async function POST(req: Request, { params }: Ctx) {
  return toggle(req, params, true);
}

export async function DELETE(req: Request, { params }: Ctx) {
  return toggle(req, params, false);
}

async function toggle(req: Request, params: Ctx["params"], star: boolean) {
  try {
    const { owner, name } = await params;
    const { db, token } = await requestDb(req);
    return json(await setStar(db, token, owner, name, star));
  } catch (err) {
    return errorResponse(err);
  }
}
