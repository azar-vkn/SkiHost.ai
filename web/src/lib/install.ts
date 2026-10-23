import type { Manifest } from "./package-format";

/** Every way to get a package, in one shape shared by the UI, REST, MCP and A2A answers. */
export function installInfo(base: string, owner: string, name: string, version: string, manifest?: Partial<Manifest>) {
  const id = `${owner}/${name}`;
  const api = `${base}/api/v1/packages/${owner}/${name}`;
  const req = manifest?.requirements;
  const requirementCommands: string[] = [];
  if (req?.pip?.length) requirementCommands.push(`pip install ${req.pip.map(shellQuote).join(" ")}`);
  if (req?.npm?.length) requirementCommands.push(`npm install ${req.npm.map(shellQuote).join(" ")}`);

  return {
    id,
    version,
    cli: `skihost install ${id}`,
    cli_pinned: `skihost install ${id}@${version}`,
    claude_code: `skihost install ${id} --claude`,
    pull: `skihost pull ${id}`,
    default_path: `skihost_modules/${owner}/${name}`,
    claude_path: manifest?.type === "skill" || !manifest?.type ? `.claude/skills/${name}` : `skihost_modules/${owner}/${name}`,
    download_url: `${api}/download?version=${version}`,
    files_url: `${api}/versions/${version}/files?content=1`,
    curl: `curl -L "${api}/download?version=${version}" -o ${name}-${version}.zip`,
    powershell: `Invoke-WebRequest "${api}/download?version=${version}" -OutFile ${name}-${version}.zip`,
    requirements: requirementCommands,
    env: req?.env ?? [],
    mcp_config: manifest?.mcp
      ? { mcpServers: { [name]: { command: manifest.mcp.command, args: manifest.mcp.args ?? [], env: manifest.mcp.env ?? {} } } }
      : null,
  };
}

function shellQuote(s: string) {
  return /^[A-Za-z0-9_.=<>~^@/+-]+$/.test(s) ? s : `"${s.replace(/"/g, '\\"')}"`;
}
