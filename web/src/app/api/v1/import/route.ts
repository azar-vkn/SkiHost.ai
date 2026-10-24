import { baseUrl, errorResponse, json, preflight } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { requestDb } from "@/lib/db";
import { importFromGitHub, type ImportRequest } from "@/lib/import-service";
import { RegistryError } from "@/lib/registry";

export const OPTIONS = preflight;
export const maxDuration = 60;

/**
 * Import from GitHub: { url, path?, ref?, name?, description?, version?, type? }.
 * Creates the rack if you don't have it yet, then pushes the folder as a new version.
 */
export async function POST(req: Request) {
  try {
    await rateLimit(req.headers, "import");
    const { db, token } = await requestDb(req);
    const body = (await req.json().catch(() => ({}))) as ImportRequest;
    if (!body.url) throw new RegistryError("`url` is required (a GitHub repository or folder URL)", 400, "invalid_request");
    const result = await importFromGitHub(db, token, body);
    const id = `${result.owner}/${result.name}`;
    return json(
      { ...result, id, url: `${baseUrl(req)}/${id}`, install: `skihost install ${id}` },
      { status: result.up_to_date ? 200 : 201 },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
