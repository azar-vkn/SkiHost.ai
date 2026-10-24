import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";
import { getAuthProviders } from "@/lib/auth-providers";
import { getCurrentProfile } from "@/lib/session";
import { safeNext } from "@/lib/safe-next";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const [providers, me] = await Promise.all([getAuthProviders(), getCurrentProfile()]);
  if (me) redirect(safeNext(next));
  return <AuthForm mode="login" next={next} google={providers.google} error={error} />;
}
