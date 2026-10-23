import type { Metadata } from "next";
import { siteUrl } from "@/lib/db";
import { Markdown } from "@/components/markdown";

export const metadata: Metadata = { title: "Docs" };

const TOC = [
  ["Getting started", "getting-started"],
  ["CLI", "cli"],
  ["Racks", "racks"],
  ["Package format", "manifest"],
  ["Publishing", "publish"],
  ["Agent recipe", "agent-recipe"],
  ["REST API", "api"],
  ["MCP server", "mcp"],
  ["A2A agent", "a2a"],
] as const;

export default async function DocsPage() {
  const b = await siteUrl();
  return (
    <div className="mx-auto grid grid-cols-1 max-w-7xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[220px_1fr]">
      <aside className="hidden lg:block">
        <nav className="sticky top-20 space-y-0.5 text-sm">
          <p className="mb-2 px-2 text-xs font-semibold tracking-wider text-muted uppercase">Documentation</p>
          {TOC.map(([label, id]) => (
            <a key={id} href={`#${id}`} className="block rounded-md px-2 py-1.5 text-muted hover:bg-inset hover:text-fg">
              {label}
            </a>
          ))}
        </nav>
      </aside>
      <article className="min-w-0 max-w-3xl">
        <Markdown source={docs(b)} anchors />
      </article>
    </div>
  );
}

function docs(b: string) {
  return `# SkiHost documentation

SkiHost is a registry for the things AI agents install: **skills**, **plugins**, **MCP servers**, **requirement files**, **prompts**, **agents** and **workflows**. It works like npm or GitHub releases, but every interface is designed for agents as much as for people.

## Getting started

Install the CLI. It is a single Node 18+ file with no dependencies.

\`\`\`bash
# macOS / Linux
curl -fsSL ${b}/install.sh | sh
\`\`\`

\`\`\`powershell
# Windows PowerShell
irm ${b}/install.ps1 | iex
\`\`\`

\`\`\`bash
# Anywhere, without installing (ideal inside an agent sandbox)
curl -fsSL ${b}/cli/skihost.mjs -o skihost.mjs
node skihost.mjs config set registry ${b}
node skihost.mjs search "pdf tables"
\`\`\`

Then find and install something:

\`\`\`bash
skihost search "extract tables from pdf"
skihost install owner/name            # → ./skihost_modules/owner/name
skihost install owner/name --claude   # → ./.claude/skills/name
\`\`\`

## CLI

Every command accepts \`--json\` and exits non-zero on failure, so agents can script it safely.

| Command | What it does |
| --- | --- |
| \`skihost search <keywords> [--type t] [--sort downloads]\` | Ranked full-text search |
| \`skihost ask "<task>"\` | Ask the marketplace agent which packages fit a task |
| \`skihost info <owner/name>\` | Details, versions, requirements and install commands |
| \`skihost install <owner/name[@version]>\` | Install into \`skihost_modules/\` and record it in \`skihost.lock.json\` |
| \`skihost install <id> --claude [--global]\` | Install into \`.claude/skills/\` (or \`~/.claude\`) |
| \`skihost install\` | Reinstall everything in \`skihost.lock.json\` |
| \`skihost pull <owner/name> [dir]\` | Download the source to edit, like \`git clone\` |
| \`skihost list\` / \`uninstall <id>\` | Manage installs in the current project |
| \`skihost login [--token skh_…]\` | Store a token (or exchange email + password for one) |
| \`skihost rack create <name> --description "…"\` | Create a rack (like a GitHub repo) before the first push |
| \`skihost rack list / edit / delete\` | Manage racks |
| \`skihost init [--type skill]\` | Scaffold \`skihost.json\`, \`SKILL.md\` and \`README.md\` |
| \`skihost push [dir] [--bump patch] [--rack name] [--create-rack]\` | Push the folder as a new version of its rack |
| \`skihost star\` / \`unstar\` / \`delete <id>\` | Manage packages |
| \`skihost mcp-config\` | Print an MCP client config pointing at this registry |

Configuration lives in \`~/.skihost/config.json\`. The environment variables \`SKIHOST_REGISTRY\` and \`SKIHOST_TOKEN\` override it, which is the easiest way to configure an agent.

## Racks {#racks}

A **rack** is SkiHost's repository. It is created once under your account with a name and a description, and then everything you push to it becomes a new version. Like on GitHub, the rack's About details (description, topics, homepage, source repository) belong to the rack, so a push never changes them; edit them on the rack page or with \`skihost rack edit\`.

| Do this | Terminal | Website | Agent |
| --- | --- | --- | --- |
| Create a rack | \`skihost rack create <name> --description "…" [--type skill] [--topics a,b]\` | **New rack** in the header ([/new](${b}/new)) | \`POST /api/v1/racks\` or the MCP tool \`create_rack\` |
| Push a version | \`skihost push\` (the manifest \`name\` picks the rack) or \`skihost push --rack <name>\` | **Push version** on the rack page | \`POST /api/v1/publish\` or \`publish_package\` |
| Edit About | \`skihost rack edit <owner/name> --description "…"\` | **Edit** next to About | \`PATCH /api/v1/racks/{owner}/{name}\` |
| List | \`skihost rack list [owner]\` | Profile → Racks | \`GET /api/v1/racks?owner=…\` |
| Delete | \`skihost rack delete <owner/name>\` | Edit → Delete rack | \`DELETE /api/v1/racks/{owner}/{name}\` |

Pushing to a rack that doesn't exist fails with \`rack_not_found\`. A new rack is **empty** until its first push: its page shows quick-setup instructions, and it can't be installed or found in search yet. Tick **Add a starter version** when creating a rack on the website to make it installable right away.

## Package format {#manifest}

A package is a folder with a \`skihost.json\` manifest at its root. Skills that follow the \`SKILL.md\` convention (YAML front matter with \`name\` and \`description\`) can skip the manifest; SkiHost generates one.

\`\`\`json
{
  "name": "pdf-tables",
  "version": "1.2.0",
  "type": "skill",
  "description": "Extract tables from PDFs into CSV or JSON.",
  "keywords": ["pdf", "tables", "extraction"],
  "agents": ["claude-code", "any"],
  "license": "MIT",
  "entry": "SKILL.md",
  "requirements": {
    "python": ">=3.10",
    "pip": ["pdfplumber>=0.11", "pandas"],
    "npm": [],
    "env": []
  },
  "mcp": { "command": "npx", "args": ["-y", "my-mcp-server"] }
}
\`\`\`

| Field | Notes |
| --- | --- |
| \`name\` | Lowercase letters, digits, \`-\`, \`_\`, \`.\`; unique within your namespace |
| \`version\` | Semver. Published versions are immutable |
| \`type\` | \`skill\`, \`plugin\`, \`mcp-server\`, \`requirements\`, \`agent\`, \`prompt\` or \`workflow\` |
| \`entry\` | The file an agent should read first |
| \`requirements\` | Shown on the package page and printed after \`skihost install\` |
| \`mcp\` | For MCP servers: how clients launch it; SkiHost renders the client config |

Never published: \`.git\`, \`node_modules\`, \`__pycache__\`, \`.venv\`, \`.env*\` (except \`.env.example\`), private keys. Add more patterns to a \`.skihostignore\` file. Packages can be up to 4 MB compressed.

## Publishing {#publish}

1. Create an account and generate a token at [/settings/tokens](${b}/settings/tokens).
2. \`skihost login --token <token>\` (or set \`SKIHOST_TOKEN\`).
3. Create the rack once: \`skihost rack create hello-skill --description "Says hello"\`.
4. \`skihost init --name hello-skill\`, edit the files, then \`skihost push\`.
5. For the next release, \`skihost push --bump patch\`.

\`skihost push --create-rack\` does steps 3 and 4 in one go, taking the rack's description from the manifest.

Agents without the CLI can do the same with two HTTP calls:

\`\`\`bash
curl -X POST ${b}/api/v1/racks \\
  -H "Authorization: Bearer $SKIHOST_TOKEN" -H "Content-Type: application/json" \\
  -d '{"name":"hello-skill","description":"Says hello","type":"skill"}'

curl -X POST ${b}/api/v1/publish \\
  -H "Authorization: Bearer $SKIHOST_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"manifest":{"name":"hello-skill","version":"1.0.0","type":"skill","description":"Says hello"},
       "files":{"SKILL.md":"---\\nname: hello-skill\\ndescription: Says hello\\n---\\n# Hello"}}'
\`\`\`

The endpoint also accepts a raw zip body (\`Content-Type: application/zip\`) or \`multipart/form-data\`. Humans can upload a folder or zip at [/new](${b}/new).

## Agent recipe

A typical brief is “get a skill from SkiHost and build something with it”. Any agent with a shell can do it in four steps:

\`\`\`bash
curl -fsSL ${b}/cli/skihost.mjs -o skihost.mjs
node skihost.mjs ask "I need to extract tables from PDF invoices" --json   # pick packages[0].id
node skihost.mjs install <owner/name> --claude --json                      # returns path, entry, requirements
pip install ...                                                             # run the returned requirements
\`\`\`

The install result tells the agent exactly which file to read next (\`entry\`), so it can load the skill's instructions and carry on with the task. Agents without a shell can do the same over [MCP](#mcp) with \`search_packages\` and \`get_package_files\`, then write the files themselves. When the agent builds something reusable, it can publish it back with \`skihost push\`.

## REST API {#api}

Reads are public. Writes take \`Authorization: Bearer <token>\`. Full spec: [/openapi.json](${b}/openapi.json). Agent-oriented summary: [/llms.txt](${b}/llms.txt).

| Method | Path | Purpose |
| --- | --- | --- |
| GET | \`/api/v1/search?q=&type=&sort=&limit=&offset=\` | Search |
| GET | \`/api/v1/packages/{owner}/{name}\` | Package, versions, install commands |
| GET | \`/api/v1/packages/{owner}/{name}/versions/{version}\` | Manifest and file list (\`latest\` works) |
| GET | \`/api/v1/packages/{owner}/{name}/versions/{version}/files?content=1\` | Every file with its text |
| GET | \`/api/v1/packages/{owner}/{name}/download?version=\` | Zip archive (sha256 in \`X-SkiHost-Sha256\`) |
| POST | \`/api/v1/racks\` | Create a rack |
| GET | \`/api/v1/racks?owner=\` | List an owner's racks (including empty ones) |
| PATCH | \`/api/v1/racks/{owner}/{name}\` | Edit a rack's About details |
| POST | \`/api/v1/publish\` | Push a version into an existing rack (\`?name=\` picks the rack) |
| POST/DELETE | \`/api/v1/packages/{owner}/{name}/star\` | Star or unstar |
| DELETE | \`/api/v1/packages/{owner}/{name}\` | Delete your package |
| POST | \`/api/v1/agent\` | Ask the marketplace agent |
| POST | \`/api/v1/auth/login\` | Email + password → API token |
| GET | \`/api/v1/whoami\`, \`/api/v1/stats\` | Account, registry totals |

## MCP server {#mcp}

SkiHost is an MCP server over Streamable HTTP at \`${b}/api/mcp\`. Tools: \`search_packages\`, \`ask_marketplace\`, \`get_package\`, \`get_package_files\`, \`install_instructions\`, \`create_rack\`, \`publish_package\`, \`whoami\`. The token header is only needed for publishing.

\`\`\`bash
# Claude Code
claude mcp add --transport http skihost ${b}/api/mcp --header "Authorization: Bearer $SKIHOST_TOKEN"
\`\`\`

\`\`\`json
{
  "mcpServers": {
    "skihost": {
      "type": "http",
      "url": "${b}/api/mcp",
      "headers": { "Authorization": "Bearer skh_..." }
    }
  }
}
\`\`\`

## A2A agent {#a2a}

The marketplace agent speaks the Agent2Agent protocol (v0.3, JSON-RPC). Discover it at [/.well-known/agent-card.json](${b}/.well-known/agent-card.json) and send it a task:

\`\`\`bash
curl -s ${b}/api/a2a -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0", "id": 1, "method": "message/send",
  "params": { "message": { "role": "user", "messageId": "m-1",
    "parts": [ { "kind": "text", "text": "Find an MCP server for PostgreSQL" } ] } }
}'
\`\`\`

The result is a completed \`Task\`. Its artifact has a Markdown answer in a \`text\` part and a \`data\` part with \`{ intent, packages[] }\`, where each package carries its \`id\` and \`install\` command. \`tasks/get\` returns a stored task by id. Buyer agents can also send a \`data\` part such as \`{ "query": "pdf tables", "type": "skill" }\`.

When \`ANTHROPIC_API_KEY\` is set on the server, the marketplace agent plans its searches with Claude. Without it, a deterministic keyword pipeline answers, so the agent always works.
`;
}
