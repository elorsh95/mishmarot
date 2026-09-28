import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireSessionUser } from "@/modules/auth/session";
import { AuthCard } from "../auth-card";
import { logoutAction } from "../login/actions";
import { SetupMfa } from "./setup-mfa";

export const metadata: Metadata = { title: "הגדרת אימות דו-שלבי" };

/** The organization requires 2FA: users without it land here after logging in. */
export default async function SetupMfaPage() {
  const user = await requireSessionUser({ allowMfaSetup: true });
  if (!user.mfaSetupRequired) redirect("/");
  return (
    <AuthCard subtitle="הגדרת אימות דו-שלבי">
      <p className="mb-4 text-sm text-fg-muted">
        שלום {user.fullName}. הארגון מחייב אימות דו-שלבי. יש להגדיר אותו פעם אחת כדי להמשיך.
      </p>
      <SetupMfa />
      <form action={logoutAction} className="mt-4 text-center">
        <button type="submit" className="text-sm text-fg-muted hover:underline">
          יציאה
        </button>
      </form>
    </AuthCard>
  );
}
