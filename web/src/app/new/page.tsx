import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentProfile } from "@/lib/session";
import { NewRackForm } from "@/components/new-rack-form";
import { CommandLine } from "@/components/copy-button";

export const metadata: Metadata = { title: "Create a new rack" };

export default async function NewRackPage() {
  const me = await getCurrentProfile();
  if (!me) redirect("/login?next=/new");
  return (
    <div className="mx-auto grid grid-cols-1 max-w-6xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_300px]">
      <div>
        <h1 className="text-2xl font-semibold">Create a new rack</h1>
        <p className="mt-1 text-sm text-muted">
          A rack is like a repository: it holds one skill, plugin, MCP server or requirements set, and every push adds a new version to it.
        </p>
        <div className="mt-8 border-t border-line pt-8">
          <NewRackForm username={me.username} />
        </div>
      </div>
      <aside className="space-y-4 text-sm">
        <div className="card space-y-3 p-4">
          <h2 className="font-semibold">Prefer the terminal?</h2>
          <CommandLine command={`skihost rack create my-skill --description "What it does"`} />
          <CommandLine command="skihost push" />
          <p className="text-xs text-muted">
            Agents can create racks too: <code>POST /api/v1/racks</code> or the <code>create_rack</code> MCP tool.
          </p>
        </div>
      </aside>
    </div>
  );
}
