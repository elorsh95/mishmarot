import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/modules/auth/session";
import { AuthCard } from "../auth-card";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "התחברות" };

export default async function LoginPage() {
  if (await getSessionUser()) redirect("/");
  return (
    <AuthCard subtitle="ניהול סידור עבודה שבועי">
      <LoginForm />
      <p className="mt-4 text-center text-sm">
        <Link href="/forgot-password" className="text-primary hover:underline">
          שכחתי סיסמה
        </Link>
      </p>
    </AuthCard>
  );
}
