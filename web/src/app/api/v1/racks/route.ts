import { createAnonClient } from "@/utils/supabase/server";
import { baseUrl, errorResponse, json, preflight } from "@/lib/http";
import { requestDb } from "@/lib/db";
import { createRack, listRacks, RegistryError, type RackInput } from "@/lib/registry";

export const OPTIONS = preflight;

/** `?owner=name` → all of that owner's racks, including empty ones. */
export async function GET(req: Request) {
  try {
    const owner = new URL(req.url).searchParams.get("owner");
    if (!owner) throw new RegistryError("`owner` is required", 400, "invalid_request");
    const base = baseUrl(req);
    const racks = await listRacks(createAnonClient(), owner);
    return json({
      owner,
      racks: racks.map((r) => ({ ...r, id: `${r.owner}/${r.name}`, url: `${base}/${r.owner}/${r.name}`, empty: !r.latest_version })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Create a rack: { name, description, type?, keywords?, homepage?, repository? }. Push versions into it afterwards. */
export async function POST(req: Request) {
  try {
    const { db, token } = await requestDb(req);
    const body = (await req.json().catch(() => ({}))) as RackInput & { keywords?: string[] | string };
    const keywords = typeof body.keywords === "string" ? body.keywords.split(",") : body.keywords;
    const rack = await createRack(db, token, { ...body, keywords });
    const base = baseUrl(req);
    return json(
      {
        ...rack,
        id: `${rack.owner}/${rack.name}`,
        url: `${base}/${rack.owner}/${rack.name}`,
        next: `Push the first version: put "name": "${rack.name}" in skihost.json, then run \`skihost push\``,
      },
      { status: 201 },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
