import { createAnonClient } from "@/utils/supabase/server";
import { errorResponse, json, preflight } from "@/lib/http";
import { getStats } from "@/lib/registry";

export const OPTIONS = preflight;

export async function GET() {
  try {
    return json(await getStats(createAnonClient()));
  } catch (err) {
    return errorResponse(err);
  }
}
