import type { SupabaseClient } from "@supabase/supabase-js";
import type { BuiltPackage, Manifest, PackageType } from "./package-format";

export interface PackageSummary {
  owner: string;
  name: string;
  type: PackageType;
  description: string;
  keywords: string[];
  agents: string[];
  category: string | null;
  /** null for an empty rack (created, nothing pushed yet). */
  latest_version: string | null;
  downloads: number;
  stars: number;
  updated_at: string;
  created_at: string;
}

export interface PackageVersion {
  id: string;
  version: string;
  sha256: string;
  size: number;
  file_count: number;
  downloads: number;
  changelog: string | null;
  readme: string | null;
  manifest: Manifest;
  created_at: string;
}

export interface PackageDetail extends PackageSummary {
  id: string;
  license: string | null;
  homepage: string | null;
  repository: string | null;
  readme: string | null;
  owner_display_name: string | null;
  versions: PackageVersion[];
}

export interface FileEntry {
  path: string;
  size: number;
  is_binary: boolean;
  content?: string | null;
}

export interface SearchParams {
  q?: string | null;
  type?: string | null;
  owner?: string | null;
  sort?: "relevance" | "downloads" | "stars" | "updated" | "new" | string | null;
  limit?: number;
  offset?: number;
}

/** Errors raised by the database functions come back as short codes; map them to HTTP. */
const ERROR_STATUS: Record<string, [number, string]> = {
  auth_required: [401, "Authentication required: sign in or pass an API token (Authorization: Bearer skh_...)"],
  invalid_token: [401, "Invalid or revoked API token"],
  invalid_name: [400, "Invalid rack name: use lowercase letters, digits, '-', '_' or '.', starting and ending with a letter or digit (max 64)"],
  invalid_version: [400, "Invalid version (expected semver like 1.0.0)"],
  version_exists: [409, "That version is already published. Versions are immutable: bump the version and push again"],
  archive_too_large: [413, "Package archive is larger than 4 MB"],
  not_found: [404, "Package or version not found"],
  invalid_token_name: [400, "Token name is required"],
  rack_not_found: [
    404,
    "That rack doesn't exist yet. Create it first (skihost rack create <name> --description \"...\", or New rack on the website), then push",
  ],
  rack_exists: [409, "You already have a rack with that name"],
  description_required: [400, "A rack needs a description"],
  invalid_type: [400, "Unknown rack type"],
};

export class RegistryError extends Error {
  constructor(message: string, public status = 500, public code = "error") {
    super(message);
  }
}

function fail(error: { message: string } | null): never {
  const code = error?.message ?? "unknown";
  const mapped = ERROR_STATUS[code];
  if (mapped) throw new RegistryError(mapped[1], mapped[0], code);
  if (/schema cache|does not exist|Could not find the function/i.test(code))
    throw new RegistryError("Registry database is not set up yet: run `npm run db:migrate`", 503, "not_migrated");
  throw new RegistryError(code, 500);
}

const SUMMARY_COLUMNS =
  "id, name, type, description, keywords, agents, category, license, homepage, repository, readme, latest_version, downloads, stars, updated_at, created_at, owner:profiles!packages_owner_id_fkey!inner(username, display_name)";

export async function searchPackages(db: SupabaseClient, p: SearchParams) {
  const { data, error } = await db.rpc("search_packages", {
    p_query: p.q || null,
    p_type: p.type || null,
    p_owner: p.owner || null,
    p_sort: p.sort || (p.q ? "relevance" : "downloads"),
    p_limit: p.limit ?? 20,
    p_offset: p.offset ?? 0,
  });
  if (error) fail(error);
  const rows = (data ?? []) as (PackageSummary & { total: number; rank: number })[];
  return {
    total: rows[0]?.total ?? 0,
    results: rows.map(({ total: _t, rank: _r, ...rest }) => rest as PackageSummary),
    /** Relevance score per result, same order as `results`. */
    ranks: rows.map((r) => Number(r.rank)),
  };
}

export async function getPackage(db: SupabaseClient, owner: string, name: string): Promise<PackageDetail | null> {
  // One round trip: the package, its owner and every version embedded.
  const { data, error } = await db
    .from("packages")
    .select(
      `${SUMMARY_COLUMNS}, versions:package_versions(id, version, sha256, size, file_count, downloads, changelog, readme, manifest, created_at)`,
    )
    .eq("owner.username", owner)
    .eq("name", name)
    .maybeSingle();
  if (error) fail(error);
  if (!data) return null;

  const ownerRow = data.owner as unknown as { username: string; display_name: string | null };
  const versions = (data.versions ?? []) as unknown as PackageVersion[];
  return {
    ...(data as unknown as PackageDetail),
    owner: ownerRow.username,
    owner_display_name: ownerRow.display_name,
    versions: versions.sort((a, b) => b.created_at.localeCompare(a.created_at)),
  };
}

export interface RackInput {
  name: string;
  description: string;
  type?: string;
  keywords?: string[];
  homepage?: string | null;
  repository?: string | null;
}

/** Create an empty rack (owner/name + description). Versions are pushed into it afterwards. */
export async function createRack(db: SupabaseClient, token: string | null, rack: RackInput) {
  const { data, error } = await db.rpc("create_rack", {
    p_token: token,
    p_name: (rack.name ?? "").trim().toLowerCase(),
    p_description: rack.description ?? "",
    p_type: rack.type || "skill",
    p_keywords: rack.keywords ?? [],
    p_homepage: rack.homepage ?? null,
    p_repository: rack.repository ?? null,
  });
  if (error) fail(error);
  return data as { owner: string; name: string; id: string };
}

/** Edit a rack's About details; omitted fields stay as they are. */
export async function updateRack(
  db: SupabaseClient,
  token: string | null,
  owner: string,
  name: string,
  patch: Partial<Omit<RackInput, "name" | "type">>,
) {
  const { error } = await db.rpc("update_rack", {
    p_token: token,
    p_owner: owner,
    p_name: name,
    p_description: patch.description ?? null,
    p_keywords: patch.keywords ?? null,
    p_homepage: patch.homepage ?? null,
    p_repository: patch.repository ?? null,
  });
  if (error) fail(error);
}

/** Every rack of one owner, including empty ones (search only returns racks with versions). */
export async function listRacks(db: SupabaseClient, owner: string): Promise<PackageSummary[]> {
  const { data, error } = await db
    .from("packages")
    .select(SUMMARY_COLUMNS)
    .eq("owner.username", owner)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) fail(error);
  return (data ?? []).map((r) => ({ ...(r as unknown as PackageSummary), owner }));
}

export function pickVersion(pkg: PackageDetail, version?: string | null) {
  const wanted = !version || version === "latest" ? pkg.latest_version : version.replace(/^v/, "");
  return pkg.versions.find((v) => v.version === wanted) ?? null;
}

export async function listFiles(db: SupabaseClient, versionId: string, withContent = false): Promise<FileEntry[]> {
  const { data, error } = await db
    .from("package_files")
    .select(withContent ? "path, size, is_binary, content" : "path, size, is_binary")
    .eq("version_id", versionId)
    .order("path");
  if (error) fail(error);
  return (data ?? []) as unknown as FileEntry[];
}

export async function getFile(db: SupabaseClient, versionId: string, path: string): Promise<FileEntry | null> {
  const { data, error } = await db
    .from("package_files")
    .select("path, size, is_binary, content")
    .eq("version_id", versionId)
    .eq("path", path)
    .maybeSingle();
  if (error) fail(error);
  return data as FileEntry | null;
}

export async function downloadArchive(db: SupabaseClient, owner: string, name: string, version?: string | null) {
  const { data, error } = await db.rpc("download_archive", {
    p_owner: owner,
    p_name: name,
    p_version: version || null,
  });
  if (error) fail(error);
  const d = data as { version: string; sha256: string; size: number; type: string; manifest: Manifest; data: string };
  return { ...d, bytes: Buffer.from(d.data, "base64") };
}

export async function publishPackage(db: SupabaseClient, token: string | null, pkg: BuiltPackage) {
  const m = pkg.manifest;
  const { data, error } = await db.rpc("publish_version", {
    p_token: token,
    p_name: m.name,
    p_version: m.version,
    p_meta: {
      type: m.type,
      description: m.description,
      keywords: m.keywords ?? [],
      agents: m.agents ?? [],
      category: m.category ?? null,
      license: m.license ?? null,
      homepage: m.homepage ?? null,
      repository: m.repository ?? null,
      changelog: m.changelog ?? null,
    },
    p_manifest: m,
    p_readme: pkg.readme,
    p_files: pkg.files,
    p_archive_b64: Buffer.from(pkg.archive).toString("base64"),
    p_sha256: pkg.sha256,
  });
  if (error) fail(error);
  return data as { owner: string; name: string; version: string; first_version: boolean; sha256: string; size: number };
}

export async function deletePackage(db: SupabaseClient, token: string | null, owner: string, name: string) {
  const { error } = await db.rpc("delete_package", { p_token: token, p_owner: owner, p_name: name });
  if (error) fail(error);
}

export async function setStar(db: SupabaseClient, token: string | null, owner: string, name: string, star: boolean) {
  const { data, error } = await db.rpc("set_star", { p_token: token, p_owner: owner, p_name: name, p_star: star });
  if (error) fail(error);
  return data as { starred: boolean; stars: number };
}

export async function isStarred(db: SupabaseClient, profileId: string, packageId: string) {
  const { data } = await db
    .from("stars")
    .select("package_id")
    .eq("profile_id", profileId)
    .eq("package_id", packageId)
    .maybeSingle();
  return !!data;
}

export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  website: string | null;
  created_at: string;
}

export async function whoami(db: SupabaseClient, token: string | null): Promise<Profile | null> {
  const { data, error } = await db.rpc("whoami", { p_token: token });
  if (error) fail(error);
  return (data as Profile | null) ?? null;
}

export async function getProfile(db: SupabaseClient, username: string): Promise<Profile | null> {
  const { data, error } = await db
    .from("profiles")
    .select("id, username, display_name, bio, website, created_at")
    .eq("username", username)
    .maybeSingle();
  if (error) fail(error);
  return data as Profile | null;
}

export interface Stats {
  racks: number;
  packages: number;
  versions: number;
  downloads: number;
  publishers: number;
  types: Record<string, number>;
}

export async function getStats(db: SupabaseClient): Promise<Stats> {
  const { data, error } = await db.rpc("get_stats");
  if (error) fail(error);
  return data as Stats;
}

export async function getStarredBy(db: SupabaseClient, profileId: string): Promise<PackageSummary[]> {
  const { data, error } = await db
    .from("stars")
    .select(`package:packages!inner(${SUMMARY_COLUMNS})`)
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) fail(error);
  return (data ?? []).map((r) => {
    const p = r.package as unknown as PackageDetail & { owner: { username: string } };
    return { ...p, owner: p.owner.username } as PackageSummary;
  });
}
