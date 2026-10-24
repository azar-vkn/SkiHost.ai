import { rateLimit } from "@/lib/rate-limit";
import { errorResponse, json, preflight } from "@/lib/http";
import { cachedStats } from "@/lib/cached";

export const OPTIONS = preflight;

export async function GET(req: Request) {
  try {
    await rateLimit(req.headers, "read");
    return json(await cachedStats(), { headers: { "Cache-Control": "public, max-age=60" } });
  } catch (err) {
    return errorResponse(err);
  }
}
