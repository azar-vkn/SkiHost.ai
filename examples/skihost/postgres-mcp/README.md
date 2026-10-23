# postgres-mcp

Connects an MCP client to PostgreSQL using the reference `@modelcontextprotocol/server-postgres` server, which exposes table schemas as resources and a read-only `query` tool.

## Claude Code

```bash
claude mcp add postgres -- npx -y @modelcontextprotocol/server-postgres "$DATABASE_URL"
```

## Any MCP client

Copy `mcp.json` (or the config on the SkiHost package page) into your client's MCP settings and set `DATABASE_URL`.

## Safety

- Point it at a role with `SELECT`-only grants. The server runs queries in a read-only transaction, but least privilege is the real guard.
- Prefer a replica or a snapshot over the production primary.
