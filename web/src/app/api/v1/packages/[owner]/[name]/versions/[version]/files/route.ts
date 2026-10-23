import { createAnonClient } from "@/utils/supabase/server";
import { errorResponse, json, preflight } from "@/lib/http";
import { getFile, getPackage, listFiles, pickVersion, RegistryError } from "@/lib/registry";

type Ctx = { params: Promise<{ owner: string; name: string; version: string }> };

export const OPTIONS = preflight;

/**
 * `?path=SKILL.md` → one file. `?content=1` → every file with its text, so an agent
 * without the CLI (or without zip support) can write the package out itself.
 */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const { owner, name, version } = await params;
    const sp = new URL(req.url).searchParams;
    const db = createAnonClient();
    const pkg = await getPackage(db, owner, name);
    const v = pkg && pickVersion(pkg, version);
    if (!pkg || !v) throw new RegistryError(`${owner}/${name}@${version} not found`, 404, "not_found");

    const path = sp.get("path");
    if (path) {
      const file = await getFile(db, v.id, path);
      if (!file) throw new RegistryError(`No file ${path} in ${owner}/${name}@${v.version}`, 404, "not_found");
      if (sp.get("raw") === "1") {
        return new Response(file.content ?? "", {
          headers: { "Content-Type": "text/plain; charset=utf-8", "Access-Control-Allow-Origin": "*" },
        });
      }
      return json({ id: `${owner}/${name}`, version: v.version, ...file });
    }
    const files = await listFiles(db, v.id, sp.get("content") === "1");
    return json({ id: `${owner}/${name}`, version: v.version, files });
  } catch (err) {
    return errorResponse(err);
  }
}
