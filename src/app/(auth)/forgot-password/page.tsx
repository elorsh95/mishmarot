import type { Metadata } from "next";
import { AuthCard } from "../auth-card";
import { ForgotPasswordForm } from "./forgot-form";

export const metadata: Metadata = { title: "שכחתי סיסמה" };

export default function ForgotPasswordPage() {
  return (
    <AuthCard subtitle="שכחתי סיסמה">
      <ForgotPasswordForm />
    </AuthCard>
  );
}
