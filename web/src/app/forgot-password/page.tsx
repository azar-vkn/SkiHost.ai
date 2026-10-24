import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
