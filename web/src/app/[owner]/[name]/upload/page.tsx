import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { createAnonClient } from "@/utils/supabase/server";
import { getPackage } from "@/lib/registry";
import { getCurrentProfile } from "@/lib/session";
import { PublishForm } from "@/components/publish-form";
import { CommandLine } from "@/components/copy-button";

type Params = Promise<{ owner: string; name: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { owner, name } = await params;
  return { title: `Push to ${owner}/${name}` };
}

export default async function UploadPage({ params }: { params: Params }) {
  const { owner, name } = await params;
  const [me, pkg] = await Promise.all([getCurrentProfile(), getPackage(createAnonClient(), owner, name).catch(() => null)]);
  if (!pkg) notFound();
  if (!me) redirect(`/login?next=/${owner}/${name}/upload`);
  if (me.username !== owner) redirect(`/${owner}/${name}`);

  return (
    <div className="mx-auto grid grid-cols-1 max-w-6xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_300px]">
      <div>
        <h1 className="text-2xl font-semibold">
          Push a version to{" "}
          <Link href={`/${owner}/${name}`} className="text-accent hover:underline">
            {owner}/{name}
          </Link>
        </h1>
        <p className="mt-1 text-sm text-muted">
          {pkg.latest_version ? `Latest version is v${pkg.latest_version}. ` : "This rack is empty; this will be its first version. "}
          Versions are immutable, so each push needs a new version number.
        </p>
        <div className="mt-8">
          <PublishForm
            rack={{ owner, name, type: pkg.type, description: pkg.description, latestVersion: pkg.latest_version }}
          />
        </div>
      </div>
      <aside className="space-y-4 text-sm">
        <div className="card space-y-3 p-4">
          <h2 className="font-semibold">From the terminal</h2>
          <CommandLine command={`skihost push --rack ${name}`} />
          <CommandLine command={`skihost push --rack ${name} --bump patch`} />
          <p className="text-xs text-muted">
            Run it in the folder holding the files. Without <code>--rack</code>, the <code>name</code> in skihost.json decides which rack you push to.
          </p>
        </div>
      </aside>
    </div>
  );
}
