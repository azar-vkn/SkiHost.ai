import { createAnonClient } from "@/utils/supabase/server";
import { baseUrl, errorResponse, json, preflight } from "@/lib/http";
import { requestDb } from "@/lib/db";
import { deletePackage, getPackage, RegistryError, updateRack } from "@/lib/registry";
import { installInfo } from "@/lib/install";

type Ctx = { params: Promise<{ owner: string; name: string }> };

export const OPTIONS = preflight;

/** A rack: its About details, versions and install commands (`install` is null while the rack is empty). */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const { owner, name } = await params;
    const pkg = await getPackage(createAnonClient(), owner, name);
    if (!pkg) throw new RegistryError(`Rack ${owner}/${name} not found`, 404, "not_found");
    const latest = pkg.versions.find((v) => v.version === pkg.latest_version);
    const { id: _id, versions, ...rest } = pkg;
    return json({
      ...rest,
      id: `${owner}/${name}`,
      url: `${baseUrl(req)}/${owner}/${name}`,
      empty: !pkg.latest_version,
      manifest: latest?.manifest ?? null,
      versions: versions.map(({ id: _vid, manifest: _m, readme: _r, ...v }) => v),
      install: pkg.latest_version ? installInfo(baseUrl(req), owner, name, pkg.latest_version, latest?.manifest) : null,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Edit the rack's About details: { description?, keywords?, homepage?, repository? }. */
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { owner, name } = await params;
    const { db, token } = await requestDb(req);
    const body = (await req.json().catch(() => ({}))) as {
      description?: string;
      keywords?: string[] | string;
      homepage?: string;
      repository?: string;
    };
    const keywords = typeof body.keywords === "string" ? body.keywords.split(",") : body.keywords;
    await updateRack(db, token, owner, name, { ...body, keywords });
    return json({ updated: `${owner}/${name}` });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const { owner, name } = await params;
    const { db, token } = await requestDb(req);
    await deletePackage(db, token, owner, name);
    return json({ deleted: `${owner}/${name}` });
  } catch (err) {
    return errorResponse(err);
  }
}
