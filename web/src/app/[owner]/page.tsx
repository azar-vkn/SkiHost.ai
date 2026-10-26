import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Boxes, CalendarDays, Download, Link2, Plus, Star } from "lucide-react";
import { createAnonClient } from "@/utils/supabase/server";
import { getProfile, getStarredBy, listRacks } from "@/lib/registry";
import { compactNumber, shortDate } from "@/lib/format";
import { getCurrentProfile } from "@/lib/session";
import { PackageRow } from "@/components/package-row";
import { Avatar } from "@/components/user-menu";

type Params = Promise<{ owner: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { owner } = await params;
  return { title: owner };
}

export default async function ProfilePage({ params, searchParams }: { params: Params; searchParams: Promise<{ tab?: string }> }) {
  const { owner } = await params;
  const { tab } = await searchParams;
  const db = createAnonClient();
  const profile = await getProfile(db, owner).catch(() => null);
  if (!profile) notFound();

  const [results, starred, me] = await Promise.all([
    listRacks(db, owner),
    getStarredBy(db, profile.id),
    getCurrentProfile(),
  ]);
  const total = results.length;
  const downloads = results.reduce((s, p) => s + Number(p.downloads), 0);
  const showStars = tab === "stars";
  const list = showStars ? starred : results;

  return (
    <div className="mx-auto grid grid-cols-1 max-w-7xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[280px_1fr]">
      <aside>
        <Avatar name={profile.username} size={120} />
        <h1 className="mt-4 text-2xl font-semibold">{profile.display_name ?? profile.username}</h1>
        <p className="text-lg text-muted">{profile.username}</p>
        {profile.bio && <p className="mt-3 text-sm">{profile.bio}</p>}
        <ul className="mt-4 space-y-2 text-sm text-muted">
          <li className="flex items-center gap-2">
            <Boxes className="h-4 w-4" /> {total} {total === 1 ? "rack" : "racks"}
          </li>
          <li className="flex items-center gap-2">
            <Download className="h-4 w-4" /> {compactNumber(downloads)} downloads
          </li>
          {profile.website && /^https?:\/\//i.test(profile.website) && (
            <li className="flex items-center gap-2">
              <Link2 className="h-4 w-4" />
              <a href={profile.website} rel="noopener noreferrer nofollow" className="truncate text-accent hover:underline">
                {profile.website.replace(/^https?:\/\//, "")}
              </a>
            </li>
          )}
          <li className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4" /> Joined {shortDate(profile.created_at)}
          </li>
        </ul>
        {me?.username === owner && (
          <div className="mt-5 space-y-2">
            <Link href="/settings/profile" className="btn w-full">
              Edit profile
            </Link>
            <Link href="/settings/tokens" className="btn w-full">
              Manage API tokens
            </Link>
          </div>
        )}
      </aside>

      <section className="min-w-0">
        <nav className="flex items-center gap-1 border-b border-line text-sm">
          <Link href={`/${owner}`} className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 ${!showStars ? "border-accent font-medium" : "border-transparent text-muted hover:text-fg"}`}>
            <Boxes className="h-4 w-4" /> Racks <span className="rounded-full bg-inset px-1.5 text-xs text-muted">{total}</span>
          </Link>
          <Link href={`/${owner}?tab=stars`} className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 ${showStars ? "border-accent font-medium" : "border-transparent text-muted hover:text-fg"}`}>
            <Star className="h-4 w-4" /> Stars <span className="rounded-full bg-inset px-1.5 text-xs text-muted">{starred.length}</span>
          </Link>
          {me?.username === owner && (
            <Link href="/new" className="btn btn-primary ml-auto h-7 px-2.5 text-xs">
              <Plus className="h-3.5 w-3.5" /> New rack
            </Link>
          )}
        </nav>
        {list.length ? (
          list.map((p) => <PackageRow key={`${p.owner}/${p.name}`} pkg={p} showOwner={showStars} />)
        ) : (
          <div className="py-16 text-center text-muted">
            {showStars ? `${owner} hasn't starred anything yet.` : `${owner} hasn't created any racks yet.`}
            {me?.username === owner && !showStars && (
              <div className="mt-4">
                <Link href="/new" className="btn btn-primary">
                  Create your first rack
                </Link>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
