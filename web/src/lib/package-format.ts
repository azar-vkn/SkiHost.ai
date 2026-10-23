import { createHash } from "node:crypto";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";

export const PACKAGE_TYPES = ["skill", "plugin", "mcp-server", "requirements", "agent", "prompt", "workflow"] as const;
export type PackageType = (typeof PACKAGE_TYPES)[number];

export const NAME_RE = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;
export const SEMVER_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

/** skihost.json — the manifest every package carries at its root. */
export interface Manifest {
  name: string;
  version: string;
  type: PackageType;
  description?: string;
  keywords?: string[];
  agents?: string[];
  category?: string;
  license?: string;
  homepage?: string;
  repository?: string;
  /** File an agent should read first (SKILL.md for skills, README.md otherwise). */
  entry?: string;
  requirements?: {
    python?: string;
    node?: string;
    pip?: string[];
    npm?: string[];
    system?: string[];
    env?: string[];
  };
  /** MCP servers: how a client launches it. */
  mcp?: { command: string; args?: string[]; env?: Record<string, string> };
  changelog?: string;
}

export interface PackageFile {
  path: string;
  size: number;
  is_binary: boolean;
  content: string | null;
}

export interface BuiltPackage {
  manifest: Manifest;
  readme: string | null;
  files: PackageFile[];
  archive: Uint8Array;
  sha256: string;
}

export class PackageError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const MAX_FILES = 500;
const MAX_UNPACKED = 20 * 1024 * 1024;
const MAX_ARCHIVE = 4 * 1024 * 1024;
const MAX_INLINE_TEXT = 256 * 1024;

// Never published, even if present: secrets, VCS metadata, dependency folders, OS junk.
const IGNORED = [
  /(^|\/)\.git(\/|$)/,
  /(^|\/)node_modules(\/|$)/,
  /(^|\/)__pycache__(\/|$)/,
  /(^|\/)\.venv(\/|$)/,
  /(^|\/)skihost_modules(\/|$)/,
  /(^|\/)\.env(\..*)?$/,
  /(^|\/)\.DS_Store$/,
  /(^|\/)Thumbs\.db$/,
  /\.pem$/,
  /(^|\/)id_rsa/,
];

export function isIgnored(path: string) {
  return IGNORED.some((re) => re.test(path)) && !path.endsWith(".env.example");
}

/** Unpacks an uploaded zip into a path → bytes map, refusing zip bombs. */
export function unzipUpload(data: Uint8Array): Record<string, Uint8Array> {
  if (data.byteLength > MAX_ARCHIVE * 2) throw new PackageError("Upload is larger than 8 MB", 413);
  let total = 0;
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(data, {
      filter: (f) => {
        total += f.originalSize;
        if (total > MAX_UNPACKED) throw new PackageError("Package unpacks to more than 20 MB", 413);
        return !f.name.endsWith("/");
      },
    });
  } catch (err) {
    if (err instanceof PackageError) throw err;
    throw new PackageError("Upload is not a valid .zip archive");
  }
  return entries;
}

/**
 * Normalises a set of files into a publishable package: resolves the manifest
 * (skihost.json, else SKILL.md front matter), applies overrides, and re-zips deterministically.
 */
export function buildPackage(input: Record<string, Uint8Array>, overrides: Partial<Manifest> = {}): BuiltPackage {
  let files: Record<string, Uint8Array> = {};
  for (const [raw, bytes] of Object.entries(input)) {
    const path = raw.replace(/\\/g, "/").replace(/^\.?\/+/, "");
    if (!path || path.endsWith("/") || path.split("/").includes("..") || isIgnored(path)) continue;
    files[path] = bytes;
  }
  files = stripSharedRoot(files);

  const paths = Object.keys(files);
  if (paths.length === 0) throw new PackageError("Package has no files");
  if (paths.length > MAX_FILES) throw new PackageError(`Package has more than ${MAX_FILES} files`);

  let manifest: Partial<Manifest> = {};
  if (files["skihost.json"]) {
    try {
      manifest = JSON.parse(strFromU8(files["skihost.json"]));
    } catch {
      throw new PackageError("skihost.json is not valid JSON");
    }
  }
  const skillMd = files["SKILL.md"] ? strFromU8(files["SKILL.md"]) : null;
  if (skillMd) {
    const fm = parseFrontmatter(skillMd).data;
    manifest = {
      name: fm.name as string | undefined,
      description: fm.description as string | undefined,
      version: fm.version as string | undefined,
      license: fm.license as string | undefined,
      type: "skill",
      ...manifest,
    };
  }
  manifest = { ...manifest, ...stripUndefined(overrides) };

  const finalManifest = validateManifest(manifest, files);
  files["skihost.json"] = strToU8(JSON.stringify(finalManifest, null, 2) + "\n");

  const readmePath = ["README.md", "readme.md", "Readme.md", "SKILL.md"].find((p) => files[p]);
  const readme = readmePath ? strFromU8(files[readmePath]) : null;

  const listed: PackageFile[] = Object.keys(files)
    .sort(comparePaths)
    .map((path) => {
      const bytes = files[path];
      const text = decodeText(bytes);
      return {
        path,
        size: bytes.byteLength,
        is_binary: text === null,
        content: text !== null && bytes.byteLength <= MAX_INLINE_TEXT ? text : null,
      };
    });

  // Fixed timestamps keep the archive (and its sha256) reproducible for identical content.
  const zipInput: Record<string, [Uint8Array, { mtime: Date }]> = {};
  for (const p of Object.keys(files).sort()) zipInput[p] = [files[p], { mtime: new Date("2000-01-01T00:00:00Z") }];
  const archive = zipSync(zipInput, { level: 6 });
  if (archive.byteLength > MAX_ARCHIVE) throw new PackageError("Compressed package is larger than 4 MB", 413);

  return {
    manifest: finalManifest,
    readme,
    files: listed,
    archive,
    sha256: createHash("sha256").update(archive).digest("hex"),
  };
}

function validateManifest(m: Partial<Manifest>, files: Record<string, Uint8Array>): Manifest {
  const name = (m.name ?? "").toString().trim().toLowerCase();
  if (!name) throw new PackageError("Missing package name (set \"name\" in skihost.json or SKILL.md front matter)");
  if (!NAME_RE.test(name))
    throw new PackageError(`Invalid name "${name}": use lowercase letters, digits, '-', '_' or '.' (max 64)`);
  const version = (m.version ?? "").toString().trim().replace(/^v/, "");
  if (!SEMVER_RE.test(version)) throw new PackageError(`Invalid or missing version "${version}" (expected semver like 1.0.0)`);
  const type = (m.type ?? (files["SKILL.md"] ? "skill" : "plugin")) as PackageType;
  if (!PACKAGE_TYPES.includes(type)) throw new PackageError(`Unknown type "${type}" (one of ${PACKAGE_TYPES.join(", ")})`);
  // The rack carries the canonical description; a version's own description is optional.
  const description = (m.description ?? "").toString().trim();

  const list = (v: unknown) =>
    Array.isArray(v) ? v.map((x) => String(x).trim().toLowerCase()).filter(Boolean).slice(0, 20) : undefined;

  return stripUndefined({
    name,
    version,
    type,
    description: description.slice(0, 500) || undefined,
    keywords: list(m.keywords),
    agents: list(m.agents),
    category: m.category?.toString().trim() || undefined,
    license: m.license?.toString().trim() || undefined,
    homepage: m.homepage?.toString().trim() || undefined,
    repository: m.repository?.toString().trim() || undefined,
    entry: m.entry ?? (files["SKILL.md"] ? "SKILL.md" : files["README.md"] ? "README.md" : undefined),
    requirements: m.requirements,
    mcp: m.mcp,
    changelog: m.changelog?.toString().slice(0, 5000) || undefined,
  }) as Manifest;
}

/** Zips from Finder/Explorer usually wrap everything in one folder; publish its contents instead. */
function stripSharedRoot(files: Record<string, Uint8Array>) {
  const paths = Object.keys(files);
  if (paths.some((p) => !p.includes("/"))) return files;
  const roots = new Set(paths.map((p) => p.split("/")[0]));
  if (roots.size !== 1) return files;
  const root = [...roots][0] + "/";
  return Object.fromEntries(paths.map((p) => [p.slice(root.length), files[p]]));
}

function decodeText(bytes: Uint8Array): string | null {
  const head = bytes.subarray(0, 8000);
  if (head.includes(0)) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** Folders first, then files, like a repository tree. */
export function comparePaths(a: string, b: string) {
  const pa = a.split("/");
  const pb = b.split("/");
  for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
    if (pa[i] === pb[i]) continue;
    const aDir = i < pa.length - 1;
    const bDir = i < pb.length - 1;
    if (aDir !== bDir) return aDir ? -1 : 1;
    return pa[i].localeCompare(pb[i]);
  }
  return pa.length - pb.length;
}

function stripUndefined<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

/** Minimal YAML front matter: `key: value`, `key: [a, b]` and `- item` lists. */
export function parseFrontmatter(md: string): { data: Record<string, unknown>; body: string } {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { data: {}, body: md };
  const data: Record<string, unknown> = {};
  let listKey: string | null = null;
  for (const line of m[1].split(/\r?\n/)) {
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item && listKey) {
      (data[listKey] as string[]).push(unquote(item[1]));
      continue;
    }
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    const [, key, value] = kv;
    if (value === "") {
      data[key] = [];
      listKey = key;
    } else if (value.startsWith("[") && value.endsWith("]")) {
      data[key] = value.slice(1, -1).split(",").map((s) => unquote(s.trim())).filter(Boolean);
      listKey = null;
    } else {
      data[key] = unquote(value);
      listKey = null;
    }
  }
  return { data, body: md.slice(m[0].length) };
}

function unquote(s: string) {
  return s.replace(/^["']|["']$/g, "");
}
