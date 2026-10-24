import { strToU8 } from "fflate";
import { createAnonClient } from "@/utils/supabase/server";
import { baseUrl, bearerToken, CORS_HEADERS, preflight } from "@/lib/http";
import { llmBudgetAvailable, runMarketplaceAgent } from "@/lib/agent";
import { rateLimit } from "@/lib/rate-limit";
import { buildPackage, PACKAGE_TYPES } from "@/lib/package-format";
import { importFromGitHub, previewImport } from "@/lib/import-service";
import { createRack, getFile, getPackage, listFiles, pickVersion, publishPackage, RegistryError, searchPackages, whoami } from "@/lib/registry";
import { installInfo } from "@/lib/install";

/**
 * SkiHost as an MCP server (Streamable HTTP transport, stateless JSON responses).
 * Add to any MCP client: { "url": "https://<host>/api/mcp", "headers": { "Authorization": "Bearer skh_..." } }
 * The token is only needed for publish_package / whoami.
 */

export const OPTIONS = preflight;
export const maxDuration = 60;

const SERVER_INFO = { name: "skihost", title: "SkiHost Marketplace", version: "1.0.0" };
const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

const TOOLS = [
  {
    name: "search_packages",
    title: "Search SkiHost",
    description:
      "Search the SkiHost registry for skills, plugins, MCP servers, requirement files, prompts and workflows. Returns ranked packages with install commands.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Keywords describing the capability you need" },
        type: { type: "string", enum: [...PACKAGE_TYPES], description: "Optional package type filter" },
        limit: { type: "number", description: "Max results (default 10)" },
      },
      required: ["query"],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "ask_marketplace",
    title: "Ask the marketplace agent",
    description:
      "Describe a task in natural language; the SkiHost marketplace agent picks the best packages and explains how to install them.",
    inputSchema: {
      type: "object",
      properties: { message: { type: "string" } },
      required: ["message"],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "get_package",
    title: "Package details",
    description: "Details, versions, requirements and install commands for a package id like `owner/name`.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "owner/name" } },
      required: ["id"],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "get_package_files",
    title: "Get package files",
    description:
      "Return a package's files with their text content so you can write them to disk yourself (an install without the CLI). Pass `path` for a single file.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "owner/name" },
        version: { type: "string", description: "Defaults to latest" },
        path: { type: "string", description: "Optional single file path, e.g. SKILL.md" },
      },
      required: ["id"],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "install_instructions",
    title: "Install instructions",
    description: "Exact commands to install a package with the skihost CLI, curl, or as an MCP server config.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, version: { type: "string" } },
      required: ["id"],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "create_rack",
    title: "Create a rack",
    description:
      "Create a rack (like a GitHub repository) under your account. A rack must exist before anything can be pushed to it. Needs an Authorization: Bearer <SkiHost API token> header.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "lowercase-name; installs become owner/name" },
        description: { type: "string", description: "What it does and when an agent should use it" },
        type: { type: "string", enum: [...PACKAGE_TYPES] },
        topics: { type: "array", items: { type: "string" } },
        homepage: { type: "string" },
        repository: { type: "string" },
      },
      required: ["name", "description"],
    },
  },
  {
    name: "publish_package",
    title: "Push a version to a rack",
    description:
      "Push a new version, built from text files, into one of your racks. The rack must exist (create_rack), or pass create_rack: true with a description. Needs an Authorization: Bearer <SkiHost API token> header. Versions are immutable.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "The rack name (lowercase)" },
        version: { type: "string", description: "semver, e.g. 1.0.0" },
        type: { type: "string", enum: [...PACKAGE_TYPES] },
        description: { type: "string", description: "Used when create_rack creates the rack" },
        keywords: { type: "array", items: { type: "string" } },
        create_rack: { type: "boolean", description: "Create the rack first if it does not exist" },
        files: {
          type: "object",
          description: "Map of relative path → file text, e.g. { \"SKILL.md\": \"---\\nname: ...\" }",
          additionalProperties: { type: "string" },
        },
      },
      required: ["name", "version", "files"],
    },
  },
  {
    name: "import_from_github",
    title: "Import from GitHub",
    description:
      "Import a public GitHub repository folder as one of your racks (creating the rack if needed), or sync new commits into it. Call with list_only: true first to see every skill folder in a repo. Needs an Authorization: Bearer <SkiHost API token> header.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "github.com URL of a repo or folder (…/tree/<branch>/<path>), or owner/repo" },
        path: { type: "string", description: "Folder inside the repo to import" },
        ref: { type: "string", description: "Branch, tag or commit (default: the repo's default branch)" },
        name: { type: "string", description: "Rack name (default: from SKILL.md/skihost.json or the folder name)" },
        description: { type: "string", description: "Needed when creating a rack and the folder has none" },
        version: { type: "string", description: "semver; default: declared version, else 0.1.0 or the next patch" },
        list_only: { type: "boolean", description: "Only list the importable folders" },
        confirm_rights: {
          type: "boolean",
          description: "Required (true) to import: confirms the code is yours or its license allows redistributing it",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "whoami",
    title: "Who am I",
    description: "Show the SkiHost account the connection's API token belongs to.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
  },
];

type RpcRequest = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };

export async function GET() {
  return new Response("SkiHost MCP endpoint: POST JSON-RPC here (Streamable HTTP, no SSE stream).", {
    status: 405,
    headers: { ...CORS_HEADERS, Allow: "POST, OPTIONS" },
  });
}

export async function POST(req: Request) {
  let body: RpcRequest | RpcRequest[];
  try {
    body = await req.json();
  } catch {
    return rpcJson({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
  }
  const batch = Array.isArray(body) ? body : [body];
  try {
    if (batch.length > 20) throw new RegistryError("Batches are limited to 20 requests", 400, "invalid_request");
    await rateLimit(req.headers, "mcp");
  } catch (err) {
    const e = err instanceof RegistryError ? err : new RegistryError("Request rejected", 400);
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32000, message: e.message } }, { status: e.status, headers: CORS_HEADERS });
  }
  const ctx = { base: baseUrl(req), token: bearerToken(req), headers: req.headers };
  const responses = (await Promise.all(batch.map((r) => handle(r, ctx)))).filter(Boolean);
  if (responses.length === 0) return new Response(null, { status: 202, headers: CORS_HEADERS });
  return rpcJson(Array.isArray(body) ? responses : responses[0]);
}

function rpcJson(data: unknown) {
  return Response.json(data, { headers: CORS_HEADERS });
}

type Ctx = { base: string; token: string | null; headers: Headers };

async function handle(r: RpcRequest, ctx: Ctx) {
  const isNotification = r.id === undefined || r.id === null;
  const reply = (result: unknown) => (isNotification ? null : { jsonrpc: "2.0", id: r.id, result });
  const fail = (code: number, message: string) =>
    isNotification ? null : { jsonrpc: "2.0", id: r.id, error: { code, message } };

  switch (r.method) {
    case "initialize": {
      const asked = String(r.params?.protocolVersion ?? "");
      return reply({
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions:
          "Use search_packages or ask_marketplace to find a package, then install it with the `skihost install owner/name` CLI command, or call get_package_files and write the files yourself.",
      });
    }
    case "notifications/initialized":
    case "notifications/cancelled":
      return null;
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: TOOLS });
    case "tools/call": {
      const name = String(r.params?.name ?? "");
      const args = (r.params?.arguments ?? {}) as Record<string, unknown>;
      if (!TOOLS.some((t) => t.name === name)) return fail(-32602, `Unknown tool: ${name}`);
      try {
        const data = await callTool(name, args, ctx);
        return reply({
          content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }],
          ...(typeof data === "object" && data !== null && !Array.isArray(data) ? { structuredContent: data } : {}),
          isError: false,
        });
      } catch (err) {
        return reply({ content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }], isError: true });
      }
    }
    default:
      return fail(-32601, `Method not found: ${r.method}`);
  }
}

function splitId(id: unknown) {
  const [owner, name] = String(id ?? "").split("/");
  if (!owner || !name) throw new Error("Package id must look like owner/name");
  return { owner, name: name.split("@")[0], version: name.split("@")[1] ?? null };
}

async function callTool(name: string, args: Record<string, unknown>, ctx: Ctx) {
  const db = createAnonClient();
  switch (name) {
    case "search_packages": {
      const { total, results } = await searchPackages(db, {
        q: String(args.query ?? ""),
        type: (args.type as string) || null,
        limit: Math.min(Number(args.limit ?? 10), 25),
      });
      return {
        total,
        results: results.map((p) => ({
          id: `${p.owner}/${p.name}`,
          type: p.type,
          version: p.latest_version,
          description: p.description,
          keywords: p.keywords,
          downloads: p.downloads,
          stars: p.stars,
          install: `skihost install ${p.owner}/${p.name}`,
          url: `${ctx.base}/${p.owner}/${p.name}`,
        })),
      };
    }
    case "ask_marketplace": {
      const r = await runMarketplaceAgent(db, ctx.base, String(args.message ?? ""), { allowLlm: await llmBudgetAvailable(ctx.headers) });
      return { reply: r.reply, packages: r.packages.map((p) => ({ id: p.id, install: p.install, description: p.description })) };
    }
    case "get_package":
    case "install_instructions": {
      const { owner, name: pkgName, version } = splitId(args.id);
      const pkg = await getPackage(db, owner, pkgName);
      const v = pkg && pickVersion(pkg, (args.version as string) ?? version);
      if (!pkg || !v) throw new Error(`Package ${owner}/${pkgName} not found`);
      const install = installInfo(ctx.base, owner, pkgName, v.version, v.manifest);
      if (name === "install_instructions") return install;
      return {
        id: `${owner}/${pkgName}`,
        type: pkg.type,
        description: pkg.description,
        version: v.version,
        versions: pkg.versions.map((x) => x.version),
        keywords: pkg.keywords,
        license: pkg.license,
        downloads: pkg.downloads,
        stars: pkg.stars,
        manifest: v.manifest,
        install,
        readme: (pkg.readme ?? "").slice(0, 8000),
      };
    }
    case "get_package_files": {
      const { owner, name: pkgName, version } = splitId(args.id);
      const pkg = await getPackage(db, owner, pkgName);
      const v = pkg && pickVersion(pkg, (args.version as string) ?? version);
      if (!pkg || !v) throw new Error(`Package ${owner}/${pkgName} not found`);
      if (args.path) {
        const f = await getFile(db, v.id, String(args.path));
        if (!f) throw new Error(`No file ${args.path}`);
        return f;
      }
      return {
        id: `${owner}/${pkgName}`,
        version: v.version,
        suggested_path: installInfo(ctx.base, owner, pkgName, v.version, v.manifest).claude_path,
        files: await listFiles(db, v.id, true),
      };
    }
    case "publish_package": {
      if (!ctx.token) throw new Error("publish_package needs an Authorization: Bearer <SkiHost API token> header");
      const files = Object.fromEntries(
        Object.entries((args.files ?? {}) as Record<string, string>).map(([p, c]) => [p, strToU8(String(c))]),
      );
      const pkg = buildPackage(files, {
        name: args.name as string,
        version: args.version as string,
        type: args.type as never,
        description: args.description as string,
        keywords: args.keywords as string[] | undefined,
      });
      let result;
      try {
        result = await publishPackage(db, ctx.token, pkg);
      } catch (err) {
        if (!(err instanceof RegistryError) || err.code !== "rack_not_found" || !args.create_rack) throw err;
        await createRack(db, ctx.token, {
          name: pkg.manifest.name,
          description: String(args.description ?? pkg.manifest.description ?? ""),
          type: pkg.manifest.type,
          keywords: (args.keywords as string[] | undefined) ?? [],
        });
        result = await publishPackage(db, ctx.token, pkg);
      }
      return { ...result, url: `${ctx.base}/${result.owner}/${result.name}` };
    }
    case "import_from_github": {
      if (!ctx.token) throw new Error("import_from_github needs an Authorization: Bearer <SkiHost API token> header");
      const req = {
        url: String(args.url ?? ""),
        path: args.path as string | undefined,
        ref: args.ref as string | undefined,
        name: args.name as string | undefined,
        description: args.description as string | undefined,
        version: args.version as string | undefined,
        confirm_rights: args.confirm_rights === true,
      };
      await rateLimit(ctx.headers, "import");
      if (args.list_only) return await previewImport(db, ctx.token, req);
      const result = await importFromGitHub(db, ctx.token, req);
      return { ...result, id: `${result.owner}/${result.name}`, url: `${ctx.base}/${result.owner}/${result.name}` };
    }
    case "create_rack": {
      if (!ctx.token) throw new Error("create_rack needs an Authorization: Bearer <SkiHost API token> header");
      const rack = await createRack(db, ctx.token, {
        name: String(args.name ?? ""),
        description: String(args.description ?? ""),
        type: args.type as string | undefined,
        keywords: args.topics as string[] | undefined,
        homepage: args.homepage as string | undefined,
        repository: args.repository as string | undefined,
      });
      return { ...rack, id: `${rack.owner}/${rack.name}`, url: `${ctx.base}/${rack.owner}/${rack.name}`, next: "Push files with publish_package" };
    }
    case "whoami": {
      if (!ctx.token) throw new Error("No API token on this connection");
      return await whoami(db, ctx.token);
    }
  }
  throw new Error(`Unknown tool ${name}`);
}
