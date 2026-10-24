import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/utils/supabase/server";
import { ResetPasswordForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "Choose a new password" };

/** Reached from a reset email (via /auth/callback, which signs the user in) or by a signed-in user setting a password. */
export default async function ResetPasswordPage() {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login?next=/reset-password");
  const hasPassword = (user.identities ?? []).some((i) => i.provider === "email");
  return <ResetPasswordForm email={user.email ?? ""} hasPassword={hasPassword} />;
}
