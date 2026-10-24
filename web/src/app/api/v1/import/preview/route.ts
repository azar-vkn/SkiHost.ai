import { errorResponse, json, preflight } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { requestDb } from "@/lib/db";
import { previewImport, type ImportRequest } from "@/lib/import-service";
import { RegistryError } from "@/lib/registry";

export const OPTIONS = preflight;
export const maxDuration = 60;

/** Look inside a GitHub repo before importing: its details and every folder that holds a skill or manifest. */
export async function POST(req: Request) {
  try {
    await rateLimit(req.headers, "import");
    const { db, token } = await requestDb(req);
    const body = (await req.json().catch(() => ({}))) as ImportRequest;
    if (!body.url) throw new RegistryError("`url` is required (a GitHub repository or folder URL)", 400, "invalid_request");
    return json(await previewImport(db, token, body));
  } catch (err) {
    return errorResponse(err);
  }
}
