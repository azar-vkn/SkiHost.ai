/** Agent2Agent (A2A v0.3) agent card for the SkiHost marketplace agent. */
export function agentCard(base: string) {
  return {
    protocolVersion: "0.3.0",
    name: "SkiHost Marketplace Agent",
    description:
      "Finds skills, plugins, MCP servers, requirement files, prompts and workflows on SkiHost for a task described in natural language, and returns ranked packages with exact install commands.",
    url: `${base}/api/a2a`,
    preferredTransport: "JSONRPC",
    additionalInterfaces: [{ url: `${base}/api/a2a`, transport: "JSONRPC" }],
    provider: { organization: "SkiHost", url: base },
    iconUrl: `${base}/icon.svg`,
    version: "1.0.0",
    documentationUrl: `${base}/docs#a2a`,
    capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: false },
    defaultInputModes: ["text/plain", "application/json"],
    defaultOutputModes: ["text/markdown", "application/json"],
    skills: [
      {
        id: "find-package",
        name: "Find a package for a task",
        description:
          "Given what the buyer agent has to build or do, search the registry and recommend the best skills/plugins/MCP servers with install commands. Send text, or a data part { query, type }.",
        tags: ["search", "skills", "plugins", "mcp", "marketplace"],
        examples: [
          "I need a skill that extracts tables from PDF invoices",
          "Find an MCP server for PostgreSQL",
          "requirements for a FastAPI + SQLAlchemy project",
        ],
        inputModes: ["text/plain", "application/json"],
        outputModes: ["text/markdown", "application/json"],
      },
      {
        id: "install-instructions",
        name: "Install instructions",
        description: "Given a package id (owner/name[@version]), return the exact CLI, download and requirements commands.",
        tags: ["install", "download"],
        examples: ["How do I install skihost/pdf-toolkit?"],
      },
      {
        id: "publish-help",
        name: "Publishing guide",
        description: "Explains how an agent publishes (pushes) its own skill to SkiHost via the CLI, REST or MCP.",
        tags: ["publish", "push"],
        examples: ["How do I publish the skill I just built?"],
      },
    ],
  };
}
