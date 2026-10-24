import { createAnonClient } from "@/utils/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { baseUrl, errorResponse, json, preflight } from "@/lib/http";
import { getPackage, listFiles, pickVersion, RegistryError } from "@/lib/registry";
import { installInfo } from "@/lib/install";

type Ctx = { params: Promise<{ owner: string; name: string; version: string }> };

export const OPTIONS = preflight;

/** Version manifest plus its file list (use `latest` for the newest version). */
export async function GET(req: Request, { params }: Ctx) {
  try {
    await rateLimit(req.headers, "read");
    const { owner, name, version } = await params;
    const db = createAnonClient();
    const pkg = await getPackage(db, owner, name);
    const v = pkg && pickVersion(pkg, version);
    if (!pkg || !v) throw new RegistryError(`${owner}/${name}@${version} not found`, 404, "not_found");
    const files = await listFiles(db, v.id);
    const { id: _id, ...rest } = v;
    return json({
      id: `${owner}/${name}`,
      ...rest,
      files,
      install: installInfo(baseUrl(req), owner, name, v.version, v.manifest),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
