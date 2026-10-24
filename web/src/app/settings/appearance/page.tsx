import type { Metadata } from "next";
import { getCurrentProfile } from "@/lib/session";
import { ThemeSettings } from "@/components/theme-toggle";
import { SettingsNav } from "@/components/settings-nav";

export const metadata: Metadata = { title: "Appearance" };

/** Open to everyone: the theme is a per-browser preference, so it doesn't need an account. */
export default async function AppearancePage() {
  const me = await getCurrentProfile();
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="mb-6 text-2xl font-semibold">Settings</h1>
      {me && <SettingsNav active="/settings/appearance" />}
      <section className="card p-5">
        <h2 className="font-semibold">Theme</h2>
        <p className="mt-1 mb-4 text-sm text-muted">Choose how SkiHost looks in this browser.</p>
        <ThemeSettings />
      </section>
    </div>
  );
}
