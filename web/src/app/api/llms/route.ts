import { baseUrl } from "@/lib/http";

/** /llms.txt — the one page an AI agent should read to use SkiHost. */
export function GET(req: Request) {
  const b = baseUrl(req);
  const body = `# SkiHost

> SkiHost is a registry of skills, plugins, MCP servers, requirement files, prompts and workflows for AI agents.
> Agents search, install, pull and publish packages from the terminal or over HTTP, MCP or A2A.

## Quick start for agents

1. Get the CLI (Node 18+, no dependencies):
   curl -fsSL ${b}/cli/skihost.mjs -o skihost.mjs
   node skihost.mjs config set registry ${b}
2. Find a package:      node skihost.mjs search "pdf table extraction" --json
3. Or ask the marketplace agent:  node skihost.mjs ask "I need to extract tables from PDF invoices" --json
4. Install it:          node skihost.mjs install owner/name            (into ./skihost_modules/owner/name)
                        node skihost.mjs install owner/name --claude   (into ./.claude/skills/name)
5. Publish your own:    node skihost.mjs login --token <token>
                        node skihost.mjs rack create <name> --description "..."   (a rack is like a GitHub repo; create it once)
                        node skihost.mjs init --name <name> && node skihost.mjs push
                        (or: node skihost.mjs push --create-rack)
6. Import from GitHub:  node skihost.mjs import https://github.com/owner/repo --list
                        node skihost.mjs import https://github.com/owner/repo/tree/main/path/to/skill

Every CLI command accepts --json for machine-readable output.

## HTTP API (no auth needed to read)

- GET  ${b}/api/v1/search?q=<keywords>&type=<skill|plugin|mcp-server|requirements|agent|prompt|workflow>
- GET  ${b}/api/v1/packages/{owner}/{name}
- GET  ${b}/api/v1/packages/{owner}/{name}/versions/{version|latest}/files?content=1   (all files as text — install without the CLI)
- GET  ${b}/api/v1/packages/{owner}/{name}/download?version=<v>                         (zip)
- POST ${b}/api/v1/agent   {"message": "what you need"}                                  (marketplace agent)
- POST ${b}/api/v1/racks   (Authorization: Bearer <token>) {"name": "...", "description": "...", "type": "skill"}   create a rack first
- POST ${b}/api/v1/import  (Authorization: Bearer <token>) {"url": "https://github.com/owner/repo", "path": "folder"}   import a public GitHub folder
- POST ${b}/api/v1/publish (Authorization: Bearer <token>) JSON {"manifest": {...}, "files": {"SKILL.md": "..."}} or a zip body
- OpenAPI: ${b}/openapi.json

## MCP

Streamable HTTP endpoint: ${b}/api/mcp
Tools: search_packages, ask_marketplace, get_package, get_package_files, install_instructions, create_rack, import_from_github, publish_package, whoami

## A2A (Agent2Agent)

Agent card: ${b}/.well-known/agent-card.json
JSON-RPC endpoint: ${b}/api/a2a  (method: message/send)

## Package format

Every package has a skihost.json at its root: { name, version (semver), type, description, keywords, agents, requirements: { pip, npm, env }, entry }.
Skills follow the SKILL.md convention (YAML front matter with name and description).

Docs for humans: ${b}/docs
`;
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Access-Control-Allow-Origin": "*" },
  });
}
