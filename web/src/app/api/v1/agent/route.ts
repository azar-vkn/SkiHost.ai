import { createAnonClient } from "@/utils/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { baseUrl, errorResponse, json, preflight } from "@/lib/http";
import { llmBudgetAvailable, runMarketplaceAgent } from "@/lib/agent";
import { RegistryError } from "@/lib/registry";

export const OPTIONS = preflight;
export const maxDuration = 60;

/** Plain-JSON door to the marketplace agent: `{ "message": "I need a skill that ..." }`. */
export async function POST(req: Request) {
  try {
    await rateLimit(req.headers, "agent");
    const body = (await req.json().catch(() => ({}))) as { message?: string };
    if (!body.message?.trim()) throw new RegistryError("`message` is required", 400, "invalid_request");
    const allowLlm = await llmBudgetAvailable(req.headers);
    return json(await runMarketplaceAgent(createAnonClient(), baseUrl(req), body.message, { allowLlm }));
  } catch (err) {
    return errorResponse(err);
  }
}
