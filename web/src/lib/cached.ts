import { unstable_cache } from "next/cache";
import { createAnonClient } from "@/utils/supabase/server";
import { getStats, searchPackages } from "./registry";

/**
 * Registry-wide data that every home-page visit needs but that only changes slowly: cached for a
 * minute per server instance so traffic spikes don't turn into one database query per visitor.
 */
export const cachedStats = unstable_cache(() => getStats(createAnonClient()), ["registry-stats"], { revalidate: 60 });

export const cachedListing = unstable_cache(
  async (sort: "downloads" | "updated", limit: number) => (await searchPackages(createAnonClient(), { sort, limit })).results,
  ["registry-listing"],
  { revalidate: 60 },
);
