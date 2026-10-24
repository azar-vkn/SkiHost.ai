import { strFromU8, unzipSync } from "fflate";
import { isIgnored, NAME_RE, parseFrontmatter, PACKAGE_TYPES, PackageError, SEMVER_RE, type PackageSource, type PackageType } from "./package-format";

/**
 * Import from GitHub: turn a public repository (or one folder of it) into a SkiHost rack version.
 * Only github.com, api.github.com and codeload.github.com are ever contacted, so a user-supplied
 * URL can't make the server fetch anything else. Set GITHUB_TOKEN to lift GitHub's 60 requests/hour
 * anonymous API limit (the import still works without the API, just with less metadata).
 */

export interface GitHubLocation {
  owner: string;
  repo: string;
  ref: string | null;
  path: string;
}

export interface RepoInfo {
  fullName: string;
  description: string | null;
  defaultBranch: string;
  topics: string[];
  license: string | null;
  homepage: string | null;
  htmlUrl: string;
  stars: number;
}

export interface Candidate {
  /** Folder inside the repo ("" = repo root). */
  path: string;
  name: string;
  description: string | null;
  type: PackageType;
  version: string | null;
  fileCount: number;
  size: number;
}

export interface LoadedRepo {
  location: GitHubLocation;
  ref: string;
  commit: string | null;
  info: RepoInfo | null;
  /** Files of the selected folder, keyed by path relative to that folder. */
  files: Record<string, Uint8Array>;
  candidates: Candidate[];
}

const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;
const MAX_DOWNLOAD = 60 * 1024 * 1024;
const MAX_SELECTED = 20 * 1024 * 1024;

export class ImportError extends PackageError {
  code = "import_failed";
}

/** Accepts owner/repo, https://github.com/owner/repo[/tree|blob/<ref>/<path>], and git@github.com:owner/repo.git. */
export function parseGitHubUrl(input: string): GitHubLocation {
  let s = (input ?? "").trim().replace(/\.git$/, "").replace(/\/+$/, "");
  const ssh = s.match(/^git@github\.com:([^/]+)\/([^/]+)$/);
  if (ssh) s = `https://github.com/${ssh[1]}/${ssh[2]}`;
  if (/^[^/:\s]+\/[^/:\s]+$/.test(s)) s = `https://github.com/${s}`;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;

  let url: URL;
  try {
    url = new URL(s);
  } catch {
    throw new ImportError("That doesn't look like a GitHub URL. Use https://github.com/owner/repo");
  }
  if (!["github.com", "www.github.com"].includes(url.hostname.toLowerCase()))
    throw new ImportError("Only github.com repositories can be imported");

  const [owner, repo, kind, ref, ...rest] = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (!owner || !repo || !OWNER_RE.test(owner) || !REPO_RE.test(repo))
    throw new ImportError("Use a repository URL like https://github.com/owner/repo");
  if (kind && kind !== "tree" && kind !== "blob") throw new ImportError(`Unsupported GitHub URL (…/${kind}/…). Link to the repo or a folder in it`);
  if (kind && !ref) throw new ImportError("The URL is missing the branch or tag after /tree/");

  // A blob URL points at a file; import the folder that holds it.
  const parts = kind === "blob" ? rest.slice(0, -1) : rest;
  return { owner, repo, ref: ref ?? null, path: normalizePath(parts.join("/")) };
}

export function normalizePath(p: string | null | undefined) {
  const parts = (p ?? "").replace(/\\/g, "/").split("/").filter((x) => x && x !== ".");
  if (parts.includes("..")) throw new ImportError("Folder paths can't contain '..'");
  return parts.join("/");
}

function ghHeaders(accept = "application/vnd.github+json"): Record<string, string> {
  return {
    Accept: accept,
    "User-Agent": "skihost-github-import",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
  };
}

/** Repository details from the API, or null when rate-limited/unavailable (the import continues without them). */
export async function fetchRepoInfo(owner: string, repo: string): Promise<RepoInfo | null> {
  let res: Response;
  try {
    res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: ghHeaders(),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return null;
  }
  if (res.status === 404) throw new ImportError(`github.com/${owner}/${repo} wasn't found. Only public repositories can be imported`, 404);
  if (!res.ok) return null;
  const r = (await res.json()) as {
    full_name: string;
    description: string | null;
    default_branch: string;
    topics?: string[];
    license?: { spdx_id?: string } | null;
    homepage?: string | null;
    html_url: string;
    stargazers_count?: number;
    private?: boolean;
  };
  if (r.private) throw new ImportError("Private repositories can't be imported yet", 403);
  return {
    fullName: r.full_name,
    description: r.description,
    defaultBranch: r.default_branch,
    topics: r.topics ?? [],
    license: r.license?.spdx_id && r.license.spdx_id !== "NOASSERTION" ? r.license.spdx_id : null,
    homepage: r.homepage || null,
    htmlUrl: r.html_url,
    stars: r.stargazers_count ?? 0,
  };
}

/** The commit SHA a branch/tag points at, so the download and the recorded provenance match exactly. */
async function resolveCommit(owner: string, repo: string, ref: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}`, {
      headers: ghHeaders("application/vnd.github.sha"),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 404 || res.status === 422) throw new ImportError(`Branch, tag or commit "${ref}" wasn't found in ${owner}/${repo}`, 404);
    const sha = res.ok ? (await res.text()).trim() : "";
    return /^[0-9a-f]{40}$/.test(sha) ? sha : null;
  } catch (err) {
    if (err instanceof ImportError) throw err;
    return null;
  }
}

async function downloadZip(owner: string, repo: string, ref: string): Promise<Uint8Array> {
  const url = `https://github.com/${owner}/${repo}/archive/${ref.split("/").map(encodeURIComponent).join("/")}.zip`;
  // Follow at most one redirect, and only to GitHub's archive host: a crafted URL can't steer the server elsewhere.
  const init: RequestInit = { headers: { "User-Agent": "skihost-github-import" }, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(45_000) };
  let res = await fetch(url, init);
  if (res.status >= 300 && res.status < 400) {
    const next = new URL(res.headers.get("location") ?? "", url);
    if (next.protocol !== "https:" || next.hostname !== "codeload.github.com")
      throw new ImportError("GitHub redirected the download somewhere unexpected", 502);
    res = await fetch(next, init);
    if (res.status >= 300 && res.status < 400) throw new ImportError("GitHub redirected the download more than once", 502);
  }
  if (res.status === 404) throw new ImportError(`Couldn't download ${owner}/${repo} at "${ref}". Check the branch or tag name`, 404);
  if (!res.ok || !res.body) throw new ImportError(`GitHub returned ${res.status} for the download`, 502);
  if (Number(res.headers.get("content-length") ?? 0) > MAX_DOWNLOAD)
    throw new ImportError("That repository is too big to import (over 60 MB). Link to the folder you need instead", 413);

  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_DOWNLOAD) {
      await reader.cancel();
      throw new ImportError("That repository is too big to import (over 60 MB). Link to the folder you need instead", 413);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

/** Download a repo and return the selected folder's files plus every skill-like folder found in it. */
export async function loadFromGitHub(url: string, opts: { path?: string | null; ref?: string | null } = {}): Promise<LoadedRepo> {
  const parsed = parseGitHubUrl(url);
  const location = { ...parsed, ref: opts.ref || parsed.ref, path: opts.path != null ? normalizePath(opts.path) : parsed.path };
  const info = await fetchRepoInfo(location.owner, location.repo);
  const ref = location.ref ?? info?.defaultBranch ?? "HEAD";
  const commit = await resolveCommit(location.owner, location.repo, ref);
  const zip = await downloadZip(location.owner, location.repo, commit ?? ref);

  const prefix = location.path ? location.path + "/" : "";
  const sizes = new Map<string, number>();
  let selectedBytes = 0;
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(zip, {
      filter: (f) => {
        const rel = f.name.slice(f.name.indexOf("/") + 1);
        if (!rel || rel.endsWith("/") || isIgnored(rel)) return false;
        sizes.set(rel, f.originalSize);
        const base = rel.split("/").pop()!;
        const isMeta = base === "SKILL.md" || base === "skihost.json";
        const selected = rel.startsWith(prefix);
        if (selected) {
          selectedBytes += f.originalSize;
          if (selectedBytes > MAX_SELECTED) throw new ImportError("The selected folder unpacks to more than 20 MB. Pick a smaller folder", 413);
        }
        return selected || (isMeta && f.originalSize < 256 * 1024);
      },
    });
  } catch (err) {
    if (err instanceof ImportError) throw err;
    throw new ImportError("GitHub's archive for that repository couldn't be read", 502);
  }

  const rel = (name: string) => name.slice(name.indexOf("/") + 1);
  const meta = new Map<string, Uint8Array>();
  const files: Record<string, Uint8Array> = {};
  for (const [name, data] of Object.entries(entries)) {
    const r = rel(name);
    if (r.endsWith("/SKILL.md") || r.endsWith("/skihost.json") || r === "SKILL.md" || r === "skihost.json") meta.set(r, data);
    if (r.startsWith(prefix)) files[r.slice(prefix.length)] = data;
  }
  if (location.path && !Object.keys(files).length)
    throw new ImportError(`There's no folder "${location.path}" in ${location.owner}/${location.repo}@${ref}`, 404);

  return { location, ref, commit, info, files, candidates: findCandidates(meta, sizes, location, info) };
}

/** Folders that hold a SKILL.md or skihost.json; the repo root if none do. */
function findCandidates(meta: Map<string, Uint8Array>, sizes: Map<string, number>, loc: GitHubLocation, info: RepoInfo | null): Candidate[] {
  const dirs = new Set<string>();
  for (const p of meta.keys()) dirs.add(p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
  if (dirs.size === 0) dirs.add("");

  const out: Candidate[] = [];
  for (const dir of dirs) {
    const prefix = dir ? dir + "/" : "";
    let fileCount = 0;
    let size = 0;
    for (const [p, s] of sizes) {
      if (p.startsWith(prefix)) {
        fileCount++;
        size += s;
      }
    }
    const m = readMeta({
      ...(meta.has(prefix + "SKILL.md") ? { "SKILL.md": meta.get(prefix + "SKILL.md")! } : {}),
      ...(meta.has(prefix + "skihost.json") ? { "skihost.json": meta.get(prefix + "skihost.json")! } : {}),
    });
    out.push({
      path: dir,
      name: suggestName(m.name, dir, loc.repo),
      description: m.description ?? (dir === "" ? (info?.description ?? null) : null),
      type: m.type,
      version: m.version,
      fileCount,
      size,
    });
  }
  // Most specific first is confusing in a list; show the repo order instead.
  return out.sort((a, b) => a.path.localeCompare(b.path)).slice(0, 200);
}

/** name/description/version/type declared by skihost.json, else SKILL.md front matter. */
export function readMeta(files: Record<string, Uint8Array>) {
  let name: string | null = null;
  let description: string | null = null;
  let version: string | null = null;
  let type: PackageType = files["SKILL.md"] ? "skill" : "plugin";
  if (files["skihost.json"]) {
    try {
      const j = JSON.parse(strFromU8(files["skihost.json"]));
      name = typeof j.name === "string" ? j.name : null;
      description = typeof j.description === "string" ? j.description : null;
      version = typeof j.version === "string" && SEMVER_RE.test(j.version.replace(/^v/, "")) ? j.version.replace(/^v/, "") : null;
      if (PACKAGE_TYPES.includes(j.type)) type = j.type;
    } catch {}
  }
  if (files["SKILL.md"]) {
    const fm = parseFrontmatter(strFromU8(files["SKILL.md"])).data;
    name ??= typeof fm.name === "string" ? fm.name : null;
    description ??= typeof fm.description === "string" ? fm.description : null;
    if (!version && typeof fm.version === "string" && SEMVER_RE.test(fm.version)) version = fm.version;
  }
  return { name, description: description?.trim() || null, version, type };
}

/** A valid rack name from a declared name, the folder name or the repo name ("PDF Tools" → "pdf-tools"). */
export function suggestName(declared: string | null, dir: string, repo: string) {
  for (const raw of [declared, dir.split("/").pop(), repo]) {
    const n = (raw ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "")
      .slice(0, 64)
      .replace(/[^a-z0-9]+$/, "");
    if (NAME_RE.test(n)) return n;
  }
  return "imported";
}

export function sourceFor(loaded: LoadedRepo): PackageSource {
  const { owner, repo, path } = loaded.location;
  const at = loaded.commit ?? loaded.ref;
  return {
    type: "github",
    repo: `${owner}/${repo}`,
    ref: loaded.ref,
    path,
    ...(loaded.commit ? { commit: loaded.commit } : {}),
    url: `https://github.com/${owner}/${repo}${path || at !== "HEAD" ? `/tree/${at}${path ? "/" + path : ""}` : ""}`,
  };
}
