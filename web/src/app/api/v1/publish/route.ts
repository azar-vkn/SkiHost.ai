import { strToU8 } from "fflate";
import { baseUrl, errorResponse, json, preflight } from "@/lib/http";
import { requestDb } from "@/lib/db";
import { buildPackage, PackageError, unzipUpload, type Manifest } from "@/lib/package-format";
import { publishPackage } from "@/lib/registry";

export const OPTIONS = preflight;

/**
 * Publish a new version. Three body shapes, so anything from a CLI to a bare agent can push:
 *  - application/zip            raw archive (what `skihost push` sends)
 *  - multipart/form-data        `archive` zip, or several `files` (+ optional `manifest` JSON)
 *  - application/json           { manifest: {...}, files: { "SKILL.md": "text…" } }
 * `?version=` / `?name=` query parameters override the manifest.
 */
export async function POST(req: Request) {
  try {
    const { db, token } = await requestDb(req);
    const sp = new URL(req.url).searchParams;
    const overrides: Partial<Manifest> = {};
    if (sp.get("version")) overrides.version = sp.get("version")!;
    if (sp.get("name")) overrides.name = sp.get("name")!;

    let files: Record<string, Uint8Array>;
    const type = req.headers.get("content-type") ?? "";

    if (type.includes("application/json")) {
      const body = (await req.json()) as { manifest?: Partial<Manifest>; files?: Record<string, string> };
      if (!body.files || typeof body.files !== "object") throw new PackageError("JSON body needs a `files` object");
      files = Object.fromEntries(Object.entries(body.files).map(([p, c]) => [p, strToU8(String(c))]));
      if (body.manifest) Object.assign(overrides, body.manifest, stripEmpty(overrides));
    } else if (type.includes("multipart/form-data")) {
      const form = await req.formData();
      const archive = form.get("archive");
      if (archive instanceof File && archive.size > 0) {
        files = unzipUpload(new Uint8Array(await archive.arrayBuffer()));
      } else {
        files = {};
        for (const entry of form.getAll("files")) {
          if (entry instanceof File) files[entry.name] = new Uint8Array(await entry.arrayBuffer());
        }
      }
      const manifest = form.get("manifest");
      if (typeof manifest === "string" && manifest.trim()) Object.assign(overrides, JSON.parse(manifest), stripEmpty(overrides));
    } else {
      files = unzipUpload(new Uint8Array(await req.arrayBuffer()));
    }

    const pkg = buildPackage(files, overrides);
    const result = await publishPackage(db, token, pkg);
    return json(
      {
        ...result,
        id: `${result.owner}/${result.name}`,
        url: `${baseUrl(req)}/${result.owner}/${result.name}`,
        files: pkg.files.length,
        install: `skihost install ${result.owner}/${result.name}@${result.version}`,
      },
      { status: 201 },
    );
  } catch (err) {
    return errorResponse(err);
  }
}

function stripEmpty<T extends object>(o: T) {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== "")) as T;
}
