#!/usr/bin/env node
// skihost — command-line client for the SkiHost registry of AI agent skills, plugins,
// MCP servers and requirement files. Single file, zero dependencies, Node 18+.
// Every command accepts --json so other agents can drive it.

import { createHash } from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import readline from "node:readline";

const VERSION = "1.0.0";
const CONFIG_DIR = path.join(os.homedir(), ".skihost");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");
const LOCK_FILE = "skihost.lock.json";
const DEFAULT_REGISTRY = "http://localhost:3000";
const TYPES = ["skill", "plugin", "mcp-server", "requirements", "agent", "prompt", "workflow"];

// ───────────────────────────── output ─────────────────────────────

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const c = { bold: paint(1), dim: paint(2), blue: paint(34), cyan: paint(36), green: paint(32), yellow: paint(33), red: paint(31) };

class CliError extends Error {
  constructor(message, exitCode = 1, code = null) {
    super(message);
    this.exitCode = exitCode;
    this.code = code;
  }
}

// ───────────────────────────── args & config ─────────────────────────────

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split(/=(.*)/s);
      if (v !== undefined) flags[k] = v;
      else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith("-") && !BOOLEAN_FLAGS.has(k)) flags[k] = argv[++i];
      else flags[k] = true;
    } else if (a.startsWith("-") && a.length > 1) {
      for (const ch of a.slice(1)) flags[SHORT[ch] ?? ch] = true;
    } else positional.push(a);
  }
  return { positional, flags };
}
// `--version <semver>` takes a value (push); `skihost --version` is handled before parsing.
const BOOLEAN_FLAGS = new Set(["json", "claude", "yes", "force", "dry-run", "help", "global", "create-rack"]);
const SHORT = { y: "yes", f: "force", h: "help", j: "json" };

function loadConfig() {
  let cfg = {};
  try {
    cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  } catch {}
  return {
    ...cfg,
    registry: (process.env.SKIHOST_REGISTRY || cfg.registry || DEFAULT_REGISTRY).replace(/\/$/, ""),
    token: process.env.SKIHOST_TOKEN || cfg.token || null,
  };
}

function saveConfig(patch) {
  let cfg = {};
  try {
    cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  } catch {}
  const next = { ...cfg, ...patch };
  for (const k of Object.keys(next)) if (next[k] === null || next[k] === undefined) delete next[k];
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2) + "\n", { mode: 0o600 });
  return next;
}

// ───────────────────────────── HTTP ─────────────────────────────

async function api(cfg, method, pathname, { body, headers = {}, auth = false, raw = false } = {}) {
  const h = { "X-SkiHost-Client": `skihost-cli/${VERSION}`, ...headers };
  if (cfg.token) h.Authorization = `Bearer ${cfg.token}`;
  else if (auth) throw new CliError("Not logged in. Run `skihost login` or set SKIHOST_TOKEN.");
  let res;
  try {
    res = await fetch(cfg.registry + pathname, { method, headers: h, body });
  } catch (err) {
    throw new CliError(`Cannot reach registry ${cfg.registry} (${err.cause?.code ?? err.message}). Set it with \`skihost config set registry <url>\`.`);
  }
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    let code = null;
    try {
      const j = await res.json();
      msg = j.error?.message ?? msg;
      code = j.error?.code ?? null;
    } catch {}
    throw new CliError(msg, 1, code);
  }
  return raw ? res : res.json();
}

function parseId(id) {
  const m = String(id ?? "").match(/^([a-z0-9][a-z0-9-]*)\/([a-z0-9][a-z0-9._-]*)(?:@(.+))?$/i);
  if (!m) throw new CliError(`Expected a package id like owner/name or owner/name@1.2.0, got "${id ?? ""}"`);
  return { owner: m[1].toLowerCase(), name: m[2].toLowerCase(), version: m[3] ?? null };
}

// ───────────────────────────── zip (store + deflate) ─────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let k = n;
    for (let i = 0; i < 8; i++) k = k & 1 ? 0xedb88320 ^ (k >>> 1) : k >>> 1;
    t[n] = k >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, data] of Object.entries(files)) {
    const nameBuf = Buffer.from(name, "utf8");
    const deflated = deflateRawSync(data, { level: 6 });
    const useDeflate = deflated.length < data.length;
    const payload = useDeflate ? deflated : data;
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(useDeflate ? 8 : 0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x2821, 12); // 2000-01-01
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, payload);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(useDeflate ? 8 : 0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x2821, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + payload.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

function unzip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new CliError("Downloaded archive is not a valid zip");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = {};
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new CliError("Corrupt zip central directory");
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith("/")) continue;
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const start = localOff + 30 + lNameLen + lExtraLen;
    const data = buf.subarray(start, start + csize);
    if (method === 0) out[name] = Buffer.from(data);
    else if (method === 8) out[name] = inflateRawSync(data);
    else throw new CliError(`Unsupported zip compression method ${method} for ${name}`);
  }
  return out;
}

// ───────────────────────────── files ─────────────────────────────

const ALWAYS_IGNORED = [
  /(^|\/)\.git(\/|$)/, /(^|\/)node_modules(\/|$)/, /(^|\/)__pycache__(\/|$)/, /(^|\/)\.venv(\/|$)/,
  /(^|\/)skihost_modules(\/|$)/, /(^|\/)\.env(\..*)?$/, /(^|\/)\.DS_Store$/, /(^|\/)Thumbs\.db$/, /\.pem$/,
  /(^|\/)id_rsa/, /(^|\/)skihost\.lock\.json$/,
];

function globToRegex(glob) {
  const g = glob.trim().replace(/^\//, "").replace(/\/$/, "");
  const re = g.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]").replace(/\u0000/g, ".*");
  return new RegExp(`(^|/)${re}(/|$)`);
}

function collectFiles(dir) {
  const ignoreFile = path.join(dir, ".skihostignore");
  const extra = fs.existsSync(ignoreFile)
    ? fs.readFileSync(ignoreFile, "utf8").split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("#")).map(globToRegex)
    : [];
  const files = {};
  const walk = (abs, rel) => {
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      const r = rel ? `${rel}/${entry.name}` : entry.name;
      if ([...ALWAYS_IGNORED, ...extra].some((re) => re.test(r)) && !r.endsWith(".env.example")) continue;
      const a = path.join(abs, entry.name);
      if (entry.isDirectory()) walk(a, r);
      else if (entry.isFile()) files[r] = fs.readFileSync(a);
    }
  };
  walk(dir, "");
  return files;
}

function writeFiles(target, files) {
  const root = path.resolve(target);
  for (const [name, data] of Object.entries(files)) {
    const dest = path.resolve(root, name);
    if (!dest.startsWith(root + path.sep)) throw new CliError(`Refusing to write outside the target: ${name}`);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, data);
  }
}

/** Never let an install or uninstall remove the working directory, home, a drive root, or any of their parents. */
function assertDeletable(target) {
  const abs = path.resolve(target);
  const protectedDirs = [process.cwd(), os.homedir(), path.parse(abs).root];
  if (protectedDirs.some((p) => p === abs || p.startsWith(abs + path.sep)))
    throw new CliError(`Refusing to replace ${abs}: it is the working directory, your home folder or one of their parents. Pick a subfolder.`);
}

/** Only wipe a directory we installed ourselves (or an empty one). */
function prepareTarget(target, expectedName, force) {
  if (!fs.existsSync(target)) return;
  assertDeletable(target);
  const entries = fs.readdirSync(target);
  if (entries.length === 0) return;
  let ours = false;
  try {
    ours = JSON.parse(fs.readFileSync(path.join(target, "skihost.json"), "utf8")).name === expectedName;
  } catch {}
  if (!ours && !force) throw new CliError(`${target} already exists and is not an install of ${expectedName}. Use --force to overwrite.`);
  fs.rmSync(target, { recursive: true, force: true });
}

function readLock(cwd = process.cwd()) {
  try {
    return JSON.parse(fs.readFileSync(path.join(cwd, LOCK_FILE), "utf8"));
  } catch {
    return { lockfileVersion: 1, packages: {} };
  }
}
function writeLock(lock, cwd = process.cwd()) {
  fs.writeFileSync(path.join(cwd, LOCK_FILE), JSON.stringify(lock, null, 2) + "\n");
}

async function prompt(question, { hidden = false } = {}) {
  if (!process.stdin.isTTY) throw new CliError(`Cannot prompt for "${question.trim()}" without a terminal; pass it as a flag.`);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) {
    rl._writeToOutput = (s) => {
      if (s.includes(question)) rl.output.write(s);
      else if (s === "\r\n" || s === "\n") rl.output.write(s);
      else rl.output.write("*");
    };
  }
  return new Promise((resolve) => rl.question(question, (ans) => (rl.close(), resolve(ans.trim()))));
}

// ───────────────────────────── commands ─────────────────────────────

const commands = {
  async search({ positional, flags }, cfg) {
    const q = positional.join(" ");
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (flags.type) sp.set("type", flags.type);
    if (flags.owner) sp.set("owner", flags.owner);
    if (flags.sort) sp.set("sort", flags.sort);
    sp.set("limit", String(flags.limit ?? 20));
    const data = await api(cfg, "GET", `/api/v1/search?${sp}`);
    if (flags.json) return data;
    if (!data.results.length) return console.log(c.dim(`No packages match "${q}".`));
    console.log(c.dim(`${data.total} result${data.total === 1 ? "" : "s"}\n`));
    for (const p of data.results) {
      console.log(`${c.bold(c.blue(`${p.owner}/${p.name}`))} ${c.dim("v" + p.latest_version)}  ${c.cyan(p.type)}  ${c.dim(`↓${p.downloads} ★${p.stars}`)}`);
      console.log(`  ${p.description}`);
      if (p.keywords?.length) console.log(c.dim(`  ${p.keywords.map((k) => "#" + k).join(" ")}`));
      console.log(c.dim(`  skihost install ${p.owner}/${p.name}\n`));
    }
  },

  async ask({ positional, flags }, cfg) {
    const message = positional.join(" ");
    if (!message) throw new CliError('Usage: skihost ask "what your agent needs to do"');
    const data = await api(cfg, "POST", "/api/v1/agent", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    if (flags.json) return data;
    console.log(data.reply);
  },

  async info({ positional, flags }, cfg) {
    const { owner, name } = parseId(positional[0]);
    const p = await api(cfg, "GET", `/api/v1/packages/${owner}/${name}`);
    if (flags.json) return p;
    console.log(`${c.bold(c.blue(p.id))} ${p.empty ? c.yellow("empty rack") : c.dim("v" + p.latest_version)}  ${c.cyan(p.type)}`);
    console.log(p.description + "\n");
    if (p.empty) {
      console.log(c.dim(`Nothing has been pushed yet. From a folder whose skihost.json has "name": "${p.name}", run: skihost push`));
      return;
    }
    const row = (k, v) => v && console.log(`${c.dim(k.padEnd(12))} ${v}`);
    row("downloads", p.downloads);
    row("stars", p.stars);
    row("license", p.license);
    row("keywords", p.keywords?.join(", "));
    row("agents", p.agents?.join(", "));
    row("versions", p.versions.map((v) => v.version).join(", "));
    row("homepage", p.homepage);
    row("repository", p.repository);
    row("web", p.url);
    console.log(`\n${c.bold("Install")}\n  ${p.install.cli}\n  ${p.install.claude_code}   ${c.dim("# into " + p.install.claude_path)}`);
    if (p.install.requirements.length) console.log(`\n${c.bold("Requirements")}\n  ${p.install.requirements.join("\n  ")}`);
    if (p.install.env.length) console.log(`\n${c.bold("Environment")}\n  ${p.install.env.join(", ")}`);
  },

  async install({ positional, flags }, cfg) {
    if (!positional.length) return commands.ci({ flags }, cfg);
    const results = [];
    for (const id of positional) results.push(await installOne(cfg, parseId(id), flags));
    if (flags.json) return results.length === 1 ? results[0] : results;
  },

  /** Reinstall everything recorded in skihost.lock.json (like `npm ci`). */
  async ci({ flags }, cfg) {
    const lock = readLock();
    const entries = Object.entries(lock.packages);
    if (!entries.length) throw new CliError(`Nothing to install: no packages in ${LOCK_FILE}. Usage: skihost install owner/name`);
    const results = [];
    for (const [id, e] of entries) {
      const { owner, name } = parseId(id);
      results.push(await installOne(cfg, { owner, name, version: e.version }, { ...flags, to: e.path, force: true }));
    }
    if (flags.json) return results;
  },

  async uninstall({ positional, flags }) {
    const { owner, name } = parseId(positional[0]);
    const lock = readLock();
    const entry = lock.packages[`${owner}/${name}`];
    if (!entry) throw new CliError(`${owner}/${name} is not in ${LOCK_FILE}`);
    assertDeletable(entry.path);
    fs.rmSync(entry.path, { recursive: true, force: true });
    delete lock.packages[`${owner}/${name}`];
    writeLock(lock);
    if (flags.json) return { removed: `${owner}/${name}`, path: entry.path };
    console.log(`${c.green("✓")} removed ${owner}/${name} (${entry.path})`);
  },

  async list({ flags }) {
    const lock = readLock();
    if (flags.json) return lock.packages;
    const entries = Object.entries(lock.packages);
    if (!entries.length) return console.log(c.dim("No SkiHost packages installed here."));
    for (const [id, e] of entries) console.log(`${c.blue(id)}@${e.version}  ${c.dim(e.path)}`);
  },

  async pull({ positional, flags }, cfg) {
    const ref = parseId(positional[0]);
    const dir = positional[1] ?? ref.name;
    const { files, version, sha256 } = await fetchArchive(cfg, ref);
    if (fs.existsSync(dir) && fs.readdirSync(dir).length && !flags.force)
      throw new CliError(`${dir} already exists and is not empty. Use --force or pick another directory.`);
    writeFiles(dir, files);
    const out = { id: `${ref.owner}/${ref.name}`, version, sha256, path: path.resolve(dir), files: Object.keys(files).length };
    if (flags.json) return out;
    console.log(`${c.green("✓")} pulled ${c.bold(out.id + "@" + version)} into ${dir}/ (${out.files} files)`);
    console.log(c.dim(`  Edit it, bump "version" in skihost.json, then \`skihost push ${dir}\` to publish your own copy.`));
  },

  async init({ positional, flags }) {
    const dir = path.resolve(positional[0] ?? ".");
    fs.mkdirSync(dir, { recursive: true });
    const manifestPath = path.join(dir, "skihost.json");
    if (fs.existsSync(manifestPath) && !flags.force) throw new CliError("skihost.json already exists (use --force to overwrite)");
    const type = flags.type ?? "skill";
    if (!TYPES.includes(type)) throw new CliError(`--type must be one of ${TYPES.join(", ")}`);
    const name = (flags.name ?? path.basename(dir)).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
    const description = flags.description ?? (flags.yes || !process.stdin.isTTY ? `A ${type} for AI agents` : (await prompt("Description: ")) || `A ${type} for AI agents`);
    const manifest = {
      name,
      version: "0.1.0",
      type,
      description,
      keywords: [],
      agents: ["claude-code", "any"],
      license: "MIT",
      entry: type === "skill" ? "SKILL.md" : "README.md",
      requirements: { pip: [], npm: [], env: [] },
    };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    const created = ["skihost.json"];
    if (type === "skill" && !fs.existsSync(path.join(dir, "SKILL.md"))) {
      fs.writeFileSync(
        path.join(dir, "SKILL.md"),
        `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n\n## When to use\n\nDescribe the tasks this skill helps with.\n\n## Instructions\n\n1. Step-by-step instructions the agent should follow.\n`,
      );
      created.push("SKILL.md");
    }
    if (!fs.existsSync(path.join(dir, "README.md"))) {
      fs.writeFileSync(path.join(dir, "README.md"), `# ${name}\n\n${description}\n\n## Install\n\n\`\`\`bash\nskihost install <your-username>/${name}\n\`\`\`\n`);
      created.push("README.md");
    }
    if (flags.json) return { path: dir, created, manifest };
    console.log(`${c.green("✓")} created ${created.join(", ")} in ${dir}`);
    console.log(c.dim(`  Next: skihost rack create ${name} --description "${description}"   (once)`));
    console.log(c.dim("  Then edit the files and run `skihost push`."));
  },

  async push({ positional, flags }, cfg) {
    const dir = path.resolve(positional[0] ?? ".");
    const manifestPath = path.join(dir, "skihost.json");
    if (!fs.existsSync(manifestPath) && !fs.existsSync(path.join(dir, "SKILL.md")))
      throw new CliError(`No skihost.json or SKILL.md in ${dir}. Run \`skihost init\` first.`);
    if (flags.bump) {
      if (!fs.existsSync(manifestPath)) throw new CliError("--bump needs a skihost.json");
      const m = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      m.version = bump(m.version, flags.bump);
      fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2) + "\n");
    }
    const files = collectFiles(dir);
    const archive = zip(files);
    const query = new URLSearchParams();
    if (flags.version) query.set("version", flags.version);
    if (flags.rack) query.set("name", String(flags.rack).split("/").pop());
    const qs = query.size ? `?${query}` : "";
    if (flags["dry-run"]) {
      const out = { dryRun: true, files: Object.keys(files), size: archive.length };
      if (flags.json) return out;
      console.log(`Would publish ${out.files.length} files (${(archive.length / 1024).toFixed(1)} KB):`);
      for (const f of out.files) console.log(c.dim("  " + f));
      return;
    }
    const send = () => api(cfg, "POST", `/api/v1/publish${qs}`, { auth: true, headers: { "Content-Type": "application/zip" }, body: archive });
    let res;
    try {
      res = await send();
    } catch (err) {
      // Pushing needs an existing rack; --create-rack creates it from the manifest first (like `gh repo create --push`).
      if (err.code !== "rack_not_found" || !flags["create-rack"]) throw err;
      const m = readLocalManifest(dir);
      const name = flags.rack ? String(flags.rack).split("/").pop() : m.name;
      if (!m.description) throw new CliError("--create-rack needs a description in skihost.json or SKILL.md");
      await api(cfg, "POST", "/api/v1/racks", {
        auth: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: m.description, type: m.type, keywords: m.keywords ?? [] }),
      });
      if (!flags.json) console.log(`${c.green("✓")} created rack ${name}`);
      res = await send();
    }
    if (flags.json) return res;
    console.log(`${c.green("✓")} pushed ${c.bold(`${res.id}@${res.version}`)} to rack ${res.id} (${res.files} files, ${(res.size / 1024).toFixed(1)} KB)`);
    console.log(`  ${res.url}`);
    console.log(c.dim(`  Anyone can now run: ${res.install}`));
  },

  async login({ flags }, cfg) {
    if (flags.registry) cfg.registry = String(flags.registry).replace(/\/$/, "");
    let token = flags.token;
    if (!token) {
      const email = flags.email ?? (await prompt("Email: "));
      const password = flags.password ?? process.env.SKIHOST_PASSWORD ?? (await prompt("Password: ", { hidden: true }));
      const res = await api({ ...cfg, token: null }, "POST", "/api/v1/auth/login", {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, token_name: `skihost-cli@${os.hostname()}` }),
      });
      token = res.token;
    }
    const me = await api({ ...cfg, token }, "GET", "/api/v1/whoami");
    saveConfig({ registry: cfg.registry, token, username: me.username });
    if (flags.json) return { username: me.username, registry: cfg.registry };
    console.log(`${c.green("✓")} logged in to ${cfg.registry} as ${c.bold(me.username)}`);
  },

  async logout({ flags }) {
    saveConfig({ token: null, username: null });
    if (flags.json) return { loggedOut: true };
    console.log("Logged out.");
  },

  async whoami({ flags }, cfg) {
    const me = await api(cfg, "GET", "/api/v1/whoami", { auth: true });
    if (flags.json) return { ...me, registry: cfg.registry };
    console.log(`${me.username} ${c.dim("@ " + cfg.registry)}`);
  },

  async star({ positional, flags }, cfg, unstar = false) {
    const { owner, name } = parseId(positional[0]);
    const res = await api(cfg, unstar ? "DELETE" : "POST", `/api/v1/packages/${owner}/${name}/star`, { auth: true });
    if (flags.json) return res;
    console.log(`${unstar ? "Unstarred" : "★ Starred"} ${owner}/${name} (${res.stars} stars)`);
  },

  async unstar(args, cfg) {
    return commands.star(args, cfg, true);
  },

  async delete({ positional, flags }, cfg) {
    const { owner, name } = parseId(positional[0]);
    if (!flags.yes) {
      const ans = await prompt(`Delete the rack ${owner}/${name} and every version in it? Type the name to confirm: `);
      if (ans !== name) throw new CliError("Aborted.");
    }
    const res = await api(cfg, "DELETE", `/api/v1/packages/${owner}/${name}`, { auth: true });
    if (flags.json) return res;
    console.log(`Deleted ${owner}/${name}.`);
  },

  async config({ positional, flags }, cfg) {
    const [action, key, value] = positional;
    if (action === "set") {
      if (!["registry", "token"].includes(key)) throw new CliError("Usage: skihost config set <registry|token> <value>");
      saveConfig({ [key]: key === "registry" ? value.replace(/\/$/, "") : value });
      return flags.json ? { [key]: value } : console.log(`${key} = ${value}`);
    }
    const shown = { registry: cfg.registry, username: cfg.username ?? null, token: cfg.token ? cfg.token.slice(0, 12) + "…" : null, file: CONFIG_FILE };
    if (action === "get") return flags.json ? { [key]: shown[key] } : console.log(shown[key] ?? "");
    if (flags.json) return shown;
    for (const [k, v] of Object.entries(shown)) console.log(`${c.dim(k.padEnd(9))} ${v ?? ""}`);
  },

  /** Racks are the repositories of SkiHost: create one (with a description) before pushing to it. */
  async rack({ positional, flags }, cfg) {
    const [action, target] = positional;
    const list = (v) => (typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : undefined);
    switch (action) {
      case "create": {
        const name = String(target ?? "").split("/").pop();
        if (!name) throw new CliError('Usage: skihost rack create <name> --description "..." [--type skill] [--topics a,b]');
        const description = flags.description ?? (process.stdin.isTTY && !flags.json ? await prompt("Description: ") : "");
        if (!description) throw new CliError('A rack needs a description: --description "what it is and when to use it"');
        const res = await api(cfg, "POST", "/api/v1/racks", {
          auth: true,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, description, type: flags.type, keywords: list(flags.topics), homepage: flags.homepage, repository: flags.repository }),
        });
        if (flags.json) return res;
        console.log(`${c.green("✓")} created rack ${c.bold(res.id)}  ${c.dim(res.url)}`);
        console.log(c.dim(`  Push the first version from a folder whose skihost.json has "name": "${res.name}":  skihost push`));
        return;
      }
      case "list":
      case "ls": {
        const owner = target ?? cfg.username ?? (await api(cfg, "GET", "/api/v1/whoami", { auth: true })).username;
        const data = await api(cfg, "GET", `/api/v1/racks?owner=${encodeURIComponent(owner)}`);
        if (flags.json) return data;
        if (!data.racks.length) return console.log(c.dim(`${owner} has no racks yet. Create one: skihost rack create <name> --description "..."`));
        for (const r of data.racks)
          console.log(`${c.bold(c.blue(r.id))} ${r.latest_version ? c.dim("v" + r.latest_version) : c.yellow("empty")}  ${c.cyan(r.type)}  ${r.description}`);
        return;
      }
      case "info":
      case "view":
        return commands.info({ positional: [target], flags }, cfg);
      case "edit": {
        const { owner, name } = parseId(target);
        const patch = { description: flags.description, keywords: list(flags.topics), homepage: flags.homepage, repository: flags.repository };
        if (Object.values(patch).every((v) => v === undefined)) throw new CliError("Nothing to change: pass --description, --topics, --homepage or --repository");
        const res = await api(cfg, "PATCH", `/api/v1/racks/${owner}/${name}`, { auth: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
        if (flags.json) return res;
        return console.log(`${c.green("✓")} updated ${owner}/${name}`);
      }
      case "delete":
        return commands.delete({ positional: [target], flags }, cfg);
      default:
        throw new CliError("Usage: skihost rack <create|list|info|edit|delete> ...");
    }
  },

  async "mcp-config"({ flags }, cfg) {
    const conf = { mcpServers: { skihost: { type: "http", url: `${cfg.registry}/api/mcp`, ...(cfg.token ? { headers: { Authorization: `Bearer ${cfg.token}` } } : {}) } } };
    if (flags.json) return conf;
    console.log(JSON.stringify(conf, null, 2));
  },
};

async function fetchArchive(cfg, { owner, name, version }) {
  const qs = version ? `?version=${encodeURIComponent(version)}` : "";
  const res = await api(cfg, "GET", `/api/v1/packages/${owner}/${name}/download${qs}`, { raw: true });
  const buf = Buffer.from(await res.arrayBuffer());
  const sha256 = createHash("sha256").update(buf).digest("hex");
  const expected = res.headers.get("x-skihost-sha256");
  if (expected && expected !== sha256) throw new CliError(`Checksum mismatch for ${owner}/${name}: archive may be corrupted`);
  return { files: unzip(buf), version: res.headers.get("x-skihost-version") ?? version, sha256 };
}

async function installOne(cfg, ref, flags) {
  const id = `${ref.owner}/${ref.name}`;
  const { files, version, sha256 } = await fetchArchive(cfg, ref);
  let manifest = {};
  try {
    manifest = JSON.parse(files["skihost.json"].toString("utf8"));
  } catch {}
  const target = flags.to
    ? String(flags.to)
    : flags.claude
      ? path.join(flags.global ? path.join(os.homedir(), ".claude") : ".claude", manifest.type === "skill" || !manifest.type ? "skills" : "plugins", ref.name)
      : path.join("skihost_modules", ref.owner, ref.name);
  prepareTarget(target, manifest.name ?? ref.name, flags.force);
  writeFiles(target, files);

  if (!flags.global) {
    const lock = readLock();
    lock.packages[id] = { version, sha256, type: manifest.type ?? null, path: target.split(path.sep).join("/"), registry: cfg.registry };
    writeLock(lock);
  }
  const req = manifest.requirements ?? {};
  const requirementCommands = [
    ...(req.pip?.length ? [`pip install ${req.pip.join(" ")}`] : []),
    ...(req.npm?.length ? [`npm install ${req.npm.join(" ")}`] : []),
  ];
  const result = {
    id,
    version,
    type: manifest.type ?? null,
    path: path.resolve(target),
    entry: manifest.entry ? path.join(path.resolve(target), manifest.entry) : null,
    files: Object.keys(files).length,
    sha256,
    requirements: requirementCommands,
    env: req.env ?? [],
  };
  if (!flags.json) {
    console.log(`${c.green("✓")} installed ${c.bold(`${id}@${version}`)} → ${target}`);
    if (result.entry) console.log(c.dim(`  entry: ${path.relative(process.cwd(), result.entry) || result.entry}`));
    if (requirementCommands.length) console.log(`  ${c.yellow("requirements:")} ${requirementCommands.join(" && ")}`);
    if (result.env.length) console.log(`  ${c.yellow("needs env:")} ${result.env.join(", ")}`);
  }
  return result;
}

/** name/description/type/keywords from skihost.json, else SKILL.md front matter. */
function readLocalManifest(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, "skihost.json"), "utf8"));
  } catch {}
  const md = fs.existsSync(path.join(dir, "SKILL.md")) ? fs.readFileSync(path.join(dir, "SKILL.md"), "utf8") : "";
  const fm = md.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
  const get = (k) => fm.match(new RegExp(`^${k}:\\s*(.+)$`, "m"))?.[1]?.trim().replace(/^["']|["']$/g, "");
  return { name: get("name"), description: get("description"), type: "skill" };
}

function bump(v, kind) {
  const m = String(v ?? "0.0.0").match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) throw new CliError(`Cannot bump version "${v}"`);
  let [maj, min, pat] = m.slice(1).map(Number);
  if (kind === "major") (maj++, (min = 0), (pat = 0));
  else if (kind === "minor") (min++, (pat = 0));
  else pat++;
  return `${maj}.${min}.${pat}`;
}

const HELP = `${c.bold("skihost")} ${VERSION} — the package manager for AI agent skills

${c.bold("Find")}
  skihost search <keywords> [--type skill|plugin|mcp-server|requirements|...] [--sort downloads]
  skihost ask "<what your agent needs to do>"      talk to the marketplace agent
  skihost info <owner/name>

${c.bold("Use")}
  skihost install <owner/name[@version]> [--claude] [--global] [--to <dir>] [--force]
  skihost install                                  reinstall everything in ${LOCK_FILE}
  skihost pull <owner/name[@version]> [dir]        download the source to edit (like git clone)
  skihost list | uninstall <owner/name>

${c.bold("Racks")} (like GitHub repositories: create one before you push)
  skihost rack create <name> --description "..." [--type skill] [--topics a,b] [--homepage u] [--repository u]
  skihost rack list [owner] | info <owner/name> | delete <owner/name>
  skihost rack edit <owner/name> [--description d] [--topics a,b] [--homepage u] [--repository u]

${c.bold("Publish")}
  skihost login [--token <skh_...>] [--email <e>]  get a token at <registry>/settings/tokens
  skihost init [dir] [--type skill] [--name n]
  skihost push [dir] [--bump patch|minor|major] [--rack name] [--create-rack] [--dry-run]
  skihost star | unstar <owner/name>

${c.bold("Setup")}
  skihost config [set registry <url> | set token <t> | get <key>]
  skihost mcp-config                               MCP client config for this registry
  skihost whoami | logout

Global flags: --json (machine-readable output), --help
Env: SKIHOST_REGISTRY, SKIHOST_TOKEN, NO_COLOR`;

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") return console.log(HELP);
  if (cmd === "--version" || cmd === "-v" || cmd === "version") return console.log(VERSION);
  const alias = { i: "install", add: "install", s: "search", find: "search", publish: "push", clone: "pull", rm: "uninstall", remove: "uninstall", ls: "list", racks: "rack", repo: "rack" };
  const run = commands[alias[cmd] ?? cmd];
  if (!run) throw new CliError(`Unknown command "${cmd}". Run \`skihost help\`.`);
  if (args.flags.help) return console.log(HELP);
  const cfg = loadConfig();
  const out = await run(args, cfg);
  if (args.flags.json && out !== undefined) console.log(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  const json = process.argv.includes("--json");
  if (json) console.log(JSON.stringify({ error: { message: err.message } }));
  else console.error(`${c.red("error")} ${err.message}`);
  process.exit(err.exitCode ?? 1);
});
