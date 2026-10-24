/**
 * Which sign-in methods are switched on in Supabase (Authentication → Providers), read from the
 * public settings endpoint so the Google button appears by itself once the provider is enabled.
 */
export async function getAuthProviders(): Promise<{ google: boolean; email: boolean }> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY! },
      next: { revalidate: 300 },
    });
    if (!res.ok) throw new Error(String(res.status));
    const s = (await res.json()) as { external?: Record<string, boolean> };
    return { google: !!s.external?.google, email: s.external?.email !== false };
  } catch {
    return { google: false, email: true };
  }
}
