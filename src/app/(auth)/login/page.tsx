import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/modules/auth/session";
import { AuthCard } from "../auth-card";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "התחברות" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getSessionUser()) redirect("/");
  const { reason } = await searchParams;
  return (
    <AuthCard subtitle="ניהול סידור עבודה שבועי">
      <LoginForm
        notice={reason === "idle" ? "נותקת מהמערכת אחרי זמן ללא פעילות. יש להתחבר שוב." : undefined}
      />
      <p className="mt-4 text-center text-sm">
        <Link href="/forgot-password" className="text-primary hover:underline">
          שכחתי סיסמה
        </Link>
      </p>
    </AuthCard>
  );
}
