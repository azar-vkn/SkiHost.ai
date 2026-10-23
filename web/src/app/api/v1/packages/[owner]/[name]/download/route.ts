import { createAnonClient } from "@/utils/supabase/server";
import { CORS_HEADERS, errorResponse, preflight } from "@/lib/http";
import { downloadArchive, getPackage, RegistryError } from "@/lib/registry";

type Ctx = { params: Promise<{ owner: string; name: string }> };

export const OPTIONS = preflight;

/** The package as a .zip (`?version=1.2.0`, default latest). Counts as a download. */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const { owner, name } = await params;
    const version = new URL(req.url).searchParams.get("version");
    const a = await downloadArchive(createAnonClient(), owner, name, version);
    return new Response(new Uint8Array(a.bytes), {
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/zip",
        "Content-Length": String(a.bytes.byteLength),
        "Content-Disposition": `attachment; filename="${name}-${a.version}.zip"`,
        "Cache-Control": "no-store",
        "X-SkiHost-Version": a.version,
        "X-SkiHost-Sha256": a.sha256,
      },
    });
  } catch (err) {
    // A rack that exists but has nothing pushed yet deserves a clearer message than "not found".
    if (err instanceof RegistryError && err.code === "not_found") {
      const { owner, name } = await params;
      const pkg = await getPackage(createAnonClient(), owner, name).catch(() => null);
      if (pkg && !pkg.latest_version) {
        return errorResponse(new RegistryError(`${owner}/${name} is an empty rack: nothing has been pushed to it yet`, 404, "rack_empty"));
      }
    }
    return errorResponse(err);
  }
}
