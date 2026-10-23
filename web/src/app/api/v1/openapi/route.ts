import { baseUrl, json } from "@/lib/http";
import { PACKAGE_TYPES } from "@/lib/package-format";

const ownerName = [
  { name: "owner", in: "path", required: true, schema: { type: "string" } },
  { name: "name", in: "path", required: true, schema: { type: "string" } },
];

export function GET(req: Request) {
  const b = baseUrl(req);
  return json({
    openapi: "3.1.0",
    info: {
      title: "SkiHost Registry API",
      version: "1.0.0",
      description:
        "Search, download and publish AI agent skills, plugins, MCP servers and requirement files. Reads are public; writes need `Authorization: Bearer <SkiHost API token>`.",
    },
    servers: [{ url: b }],
    components: {
      securitySchemes: { token: { type: "http", scheme: "bearer", description: "SkiHost API token (skh_...)" } },
    },
    paths: {
      "/api/v1/search": {
        get: {
          operationId: "searchPackages",
          summary: "Search packages",
          parameters: [
            { name: "q", in: "query", schema: { type: "string" } },
            { name: "type", in: "query", schema: { type: "string", enum: PACKAGE_TYPES } },
            { name: "owner", in: "query", schema: { type: "string" } },
            { name: "sort", in: "query", schema: { type: "string", enum: ["relevance", "downloads", "stars", "updated", "new"] } },
            { name: "limit", in: "query", schema: { type: "integer", maximum: 100 } },
            { name: "offset", in: "query", schema: { type: "integer" } },
          ],
          responses: { "200": { description: "{ total, results[] }" } },
        },
      },
      "/api/v1/racks": {
        get: {
          operationId: "listRacks",
          summary: "List an owner's racks, including empty ones",
          parameters: [{ name: "owner", in: "query", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "{ owner, racks[] }" } },
        },
        post: {
          operationId: "createRack",
          summary: "Create a rack (like a repository). Required before the first push.",
          security: [{ token: [] }],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    description: { type: "string" },
                    type: { type: "string", enum: PACKAGE_TYPES },
                    keywords: { type: "array", items: { type: "string" } },
                    homepage: { type: "string" },
                    repository: { type: "string" },
                  },
                  required: ["name", "description"],
                },
              },
            },
          },
          responses: { "201": { description: "Created" }, "409": { description: "Rack already exists" } },
        },
      },
      "/api/v1/packages/{owner}/{name}": {
        get: { operationId: "getPackage", summary: "Rack details, versions and install commands (also at /api/v1/racks/{owner}/{name})", parameters: ownerName, responses: { "200": { description: "Rack" }, "404": { description: "Not found" } } },
        patch: {
          operationId: "updateRack",
          summary: "Edit the rack's About details",
          parameters: ownerName,
          security: [{ token: [] }],
          requestBody: { content: { "application/json": { schema: { type: "object", properties: { description: { type: "string" }, keywords: { type: "array", items: { type: "string" } }, homepage: { type: "string" }, repository: { type: "string" } } } } } },
          responses: { "200": { description: "Updated" } },
        },
        delete: { operationId: "deletePackage", summary: "Delete your rack and all its versions", parameters: ownerName, security: [{ token: [] }], responses: { "200": { description: "Deleted" } } },
      },
      "/api/v1/packages/{owner}/{name}/versions/{version}": {
        get: {
          operationId: "getVersion",
          summary: "Version manifest and file list (`latest` allowed)",
          parameters: [...ownerName, { name: "version", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Version" } },
        },
      },
      "/api/v1/packages/{owner}/{name}/versions/{version}/files": {
        get: {
          operationId: "getFiles",
          summary: "Files of a version; `content=1` includes text, `path` selects one file, `raw=1` returns it as text/plain",
          parameters: [
            ...ownerName,
            { name: "version", in: "path", required: true, schema: { type: "string" } },
            { name: "path", in: "query", schema: { type: "string" } },
            { name: "content", in: "query", schema: { type: "string", enum: ["1"] } },
            { name: "raw", in: "query", schema: { type: "string", enum: ["1"] } },
          ],
          responses: { "200": { description: "Files" } },
        },
      },
      "/api/v1/packages/{owner}/{name}/download": {
        get: {
          operationId: "download",
          summary: "Download the package zip",
          parameters: [...ownerName, { name: "version", in: "query", schema: { type: "string" } }],
          responses: { "200": { description: "application/zip", content: { "application/zip": {} } } },
        },
      },
      "/api/v1/packages/{owner}/{name}/star": {
        post: { operationId: "star", summary: "Star a package", parameters: ownerName, security: [{ token: [] }], responses: { "200": { description: "{ starred, stars }" } } },
        delete: { operationId: "unstar", summary: "Unstar a package", parameters: ownerName, security: [{ token: [] }], responses: { "200": { description: "{ starred, stars }" } } },
      },
      "/api/v1/publish": {
        post: {
          operationId: "publish",
          summary: "Publish a new version (zip body, multipart, or JSON { manifest, files })",
          security: [{ token: [] }],
          parameters: [
            { name: "version", in: "query", schema: { type: "string" } },
            { name: "name", in: "query", schema: { type: "string" } },
          ],
          requestBody: {
            content: {
              "application/zip": {},
              "multipart/form-data": {},
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    manifest: { type: "object" },
                    files: { type: "object", additionalProperties: { type: "string" } },
                  },
                  required: ["files"],
                },
              },
            },
          },
          responses: { "201": { description: "Published" }, "409": { description: "Version already exists" } },
        },
      },
      "/api/v1/agent": {
        post: {
          operationId: "askMarketplaceAgent",
          summary: "Ask the marketplace agent in natural language",
          requestBody: { content: { "application/json": { schema: { type: "object", properties: { message: { type: "string" } }, required: ["message"] } } } },
          responses: { "200": { description: "{ intent, reply, packages[], engine }" } },
        },
      },
      "/api/v1/auth/login": {
        post: {
          operationId: "login",
          summary: "Exchange email + password for an API token",
          requestBody: { content: { "application/json": { schema: { type: "object", properties: { email: { type: "string" }, password: { type: "string" }, token_name: { type: "string" } }, required: ["email", "password"] } } } },
          responses: { "200": { description: "{ token, username }" } },
        },
      },
      "/api/v1/whoami": { get: { operationId: "whoami", summary: "Current account", security: [{ token: [] }], responses: { "200": { description: "Profile" } } } },
      "/api/v1/stats": { get: { operationId: "stats", summary: "Registry totals", responses: { "200": { description: "Stats" } } } },
    },
  });
}
