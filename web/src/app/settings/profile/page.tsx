import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentProfile } from "@/lib/session";
import { ProfileForm } from "@/components/profile-form";
import { SettingsNav } from "@/components/settings-nav";
import { Avatar } from "@/components/user-menu";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfileSettingsPage() {
  const me = await getCurrentProfile();
  if (!me) redirect("/login?next=/settings/profile");

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="mb-6 text-2xl font-semibold">Settings</h1>
      <SettingsNav active="/settings/profile" />
      <section className="card p-5">
        <div className="mb-5 flex items-center gap-3">
          <Avatar name={me.username} size={48} />
          <div>
            <h2 className="font-semibold">Public profile</h2>
            <p className="text-sm text-muted">Anyone can see this on your profile page.</p>
          </div>
        </div>
        <ProfileForm username={me.username} displayName={me.display_name ?? ""} bio={me.bio ?? ""} website={me.website ?? ""} />
      </section>
    </div>
  );
}
