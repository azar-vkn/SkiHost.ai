import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";
import { getAuthProviders } from "@/lib/auth-providers";
import { getCurrentProfile } from "@/lib/session";

export const metadata: Metadata = { title: "Sign up" };

export default async function SignupPage() {
  const [providers, me] = await Promise.all([getAuthProviders(), getCurrentProfile()]);
  if (me) redirect("/settings/tokens");
  return <AuthForm mode="signup" google={providers.google} />;
}
