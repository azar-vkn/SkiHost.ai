import { Blocks, Bot, FileCode2, ListChecks, MessageSquareText, Plug, Sparkles, Workflow } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const TYPE_META: Record<string, { label: string; plural: string; icon: LucideIcon; blurb: string }> = {
  skill: { label: "Skill", plural: "Skills", icon: Sparkles, blurb: "Instructions + scripts an agent loads to do a task" },
  plugin: { label: "Plugin", plural: "Plugins", icon: Blocks, blurb: "Bundles of commands, hooks and skills" },
  "mcp-server": { label: "MCP server", plural: "MCP servers", icon: Plug, blurb: "Tools exposed over Model Context Protocol" },
  requirements: { label: "Requirements", plural: "Requirements", icon: ListChecks, blurb: "Pinned dependency sets for a stack" },
  agent: { label: "Agent", plural: "Agents", icon: Bot, blurb: "Ready-made agent definitions and sub-agents" },
  prompt: { label: "Prompt", plural: "Prompts", icon: MessageSquareText, blurb: "Reusable system prompts and templates" },
  workflow: { label: "Workflow", plural: "Workflows", icon: Workflow, blurb: "Multi-step pipelines agents can run" },
};

export function TypeIcon({ type, className = "h-4 w-4" }: { type: string; className?: string }) {
  const Icon = TYPE_META[type]?.icon ?? FileCode2;
  return <Icon className={className} aria-hidden="true" />;
}

export function TypeBadge({ type }: { type: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-accent-line px-2 py-px text-[0.7rem] font-medium text-accent">
      <TypeIcon type={type} className="h-3 w-3" />
      {TYPE_META[type]?.label ?? type}
    </span>
  );
}
