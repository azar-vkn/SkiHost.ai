import { createAnonClient } from "@/utils/supabase/server";
import { baseUrl, errorResponse, json, preflight } from "@/lib/http";
import { searchPackages } from "@/lib/registry";

export const OPTIONS = preflight;

export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const base = baseUrl(req);
    const { total, results } = await searchPackages(createAnonClient(), {
      q: sp.get("q"),
      type: sp.get("type"),
      owner: sp.get("owner"),
      sort: sp.get("sort"),
      limit: Number(sp.get("limit") ?? 20),
      offset: Number(sp.get("offset") ?? 0),
    });
    return json({
      total,
      results: results.map((p) => ({
        ...p,
        id: `${p.owner}/${p.name}`,
        url: `${base}/${p.owner}/${p.name}`,
        install: `skihost install ${p.owner}/${p.name}`,
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
