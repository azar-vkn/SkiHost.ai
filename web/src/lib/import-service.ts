import type { SupabaseClient } from "@supabase/supabase-js";
import { buildPackage, PACKAGE_TYPES, SEMVER_RE, type PackageType } from "./package-format";
import { createRack, getPackage, publishPackage, RegistryError, whoami } from "./registry";
import { accountQuota } from "./rate-limit";
import { ImportError, loadFromGitHub, readMeta, sourceFor, suggestName, type Candidate, type RepoInfo } from "./github-import";

export interface ImportRequest {
  url: string;
  ref?: string | null;
  path?: string | null;
  name?: string | null;
  description?: string | null;
  version?: string | null;
  type?: string | null;
  /** The caller confirms they may redistribute this code (their own, or its license allows it). */
  confirm_rights?: boolean;
}

export interface ImportPreview {
  repo: string;
  ref: string;
  commit: string | null;
  path: string;
  info: RepoInfo | null;
  candidates: (Candidate & { existing: { latest_version: string | null } | null })[];
}

async function requireUser(db: SupabaseClient, token: string | null) {
  const me = await whoami(db, token);
  if (!me) throw new RegistryError("Sign in or pass an API token to import from GitHub", 401, "auth_required");
  return me;
}

/** What's in the repo: every skill-like folder, each with suggested rack details and whether you already have that rack. */
export async function previewImport(db: SupabaseClient, token: string | null, req: ImportRequest): Promise<ImportPreview> {
  const me = await requireUser(db, token);
  await accountQuota(token, db, "import-preview", 40, 3600);
  const loaded = await loadFromGitHub(req.url, { ref: req.ref, path: req.path ?? null });
  const prefix = loaded.location.path;
  const scoped = prefix
    ? loaded.candidates.filter((c) => c.path === prefix || c.path.startsWith(prefix + "/"))
    : loaded.candidates;
  // A folder link without a SKILL.md/skihost.json is still importable as-is.
  const candidates = scoped.length
    ? scoped
    : [{ path: prefix, ...suggest(loaded.files, prefix, loaded.location.repo, loaded.info), fileCount: Object.keys(loaded.files).length, size: 0 }];

  const withExisting = await Promise.all(
    candidates.map(async (c) => {
      const pkg = await getPackage(db, me.username, c.name).catch(() => null);
      return { ...c, existing: pkg ? { latest_version: pkg.latest_version } : null };
    }),
  );
  return {
    repo: `${loaded.location.owner}/${loaded.location.repo}`,
    ref: loaded.ref,
    commit: loaded.commit,
    path: prefix,
    info: loaded.info,
    candidates: withExisting,
  };
}

/**
 * Import one folder of a GitHub repo as a version of a rack: creates the rack (owner = caller) when
 * it doesn't exist yet, otherwise adds a version to it. Re-importing an unchanged commit is a no-op.
 */
export async function importFromGitHub(db: SupabaseClient, token: string | null, req: ImportRequest) {
  const me = await requireUser(db, token);
  if (req.confirm_rights !== true)
    throw new ImportError(
      "Confirm you have the right to publish this code on SkiHost (it's yours, or its license allows redistribution): send confirm_rights: true",
      400,
    );
  await accountQuota(token, db, "import", 20, 3600);
  const loaded = await loadFromGitHub(req.url, { ref: req.ref, path: req.path ?? null });
  if (!Object.keys(loaded.files).length) throw new ImportError("There are no files to import at that location");

  const meta = suggest(loaded.files, loaded.location.path, loaded.location.repo, loaded.info);
  const name = suggestName(req.name?.trim() || meta.name, "", loaded.location.repo);
  const type = (PACKAGE_TYPES.includes(req.type as PackageType) ? req.type : meta.type) as PackageType;
  const description = req.description?.trim() || meta.description;
  const source = sourceFor(loaded);

  const existing = await getPackage(db, me.username, name).catch(() => null);
  const latest = existing?.versions.find((v) => v.version === existing.latest_version);
  if (existing && !req.version && loaded.commit && latest?.manifest.source?.commit === loaded.commit) {
    return { up_to_date: true as const, owner: me.username, name, version: existing.latest_version, source };
  }

  const taken = new Set(existing?.versions.map((v) => v.version) ?? []);
  let version = req.version?.trim().replace(/^v/, "") || null;
  if (version && !SEMVER_RE.test(version)) throw new ImportError(`"${req.version}" isn't a semver version like 1.0.0`);
  if (!version) {
    version =
      meta.version && !taken.has(meta.version)
        ? meta.version
        : existing?.latest_version
          ? bumpPatch(existing.latest_version)
          : (meta.version ?? "0.1.0");
  }

  let createdRack = false;
  if (!existing) {
    if (!description)
      throw new ImportError("This folder has no description (no SKILL.md/skihost.json description or repo description). Add one to create the rack", 400);
    await createRack(db, token, {
      name,
      description,
      type,
      keywords: loaded.info?.topics ?? [],
      homepage: loaded.info?.homepage ?? null,
      // The rack links to the branch; each version's manifest pins the exact commit.
      repository: `https://github.com/${source.repo}${source.path ? `/tree/${source.ref}/${source.path}` : ""}`,
    });
    createdRack = true;
  }

  const pkg = buildPackage(loaded.files, {
    name,
    version,
    type,
    ...(description ? { description } : {}),
    ...(loaded.info?.license && !meta.hasLicense ? { license: loaded.info.license } : {}),
    source,
  });
  const result = await publishPackage(db, token, pkg);
  return { up_to_date: false as const, ...result, created_rack: createdRack, files: pkg.files.length, source };
}

function suggest(files: Record<string, Uint8Array>, dir: string, repo: string, info: RepoInfo | null) {
  const m = readMeta(files);
  return {
    name: suggestName(m.name, dir, repo),
    description: m.description ?? (dir === "" ? (info?.description ?? null) : null),
    type: m.type,
    version: m.version,
    hasLicense: !!files["LICENSE"] || !!files["LICENSE.md"] || !!files["LICENSE.txt"],
  };
}

function bumpPatch(v: string) {
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)/);
  return m ? `${m[1]}.${m[2]}.${Number(m[3]) + 1}` : "0.1.0";
}
