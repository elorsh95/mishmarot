import type { Metadata } from "next";
import Link from "next/link";
import { checkPasswordLink } from "@/modules/users/service";
import { AuthCard } from "../../auth-card";
import { SetPasswordForm } from "./set-password-form";

export const metadata: Metadata = { title: "קביעת סיסמה" };

/**
 * Firebase Auth "custom action URL" handler. Invitation and reset e-mails link here with
 * ?mode=resetPassword&oobCode=… (configured in the console under Authentication → Templates).
 */
export default async function AuthActionPage({ searchParams }: PageProps<"/auth/action">) {
  const params = await searchParams;
  const mode = typeof params.mode === "string" ? params.mode : "";
  const oobCode = typeof params.oobCode === "string" ? params.oobCode : "";

  if (mode !== "resetPassword" || !oobCode) {
    return (
      <AuthCard subtitle="קישור לא תקין">
        <LinkProblem text="הקישור אינו תקין." />
      </AuthCard>
    );
  }

  const check = await checkPasswordLink(oobCode);
  if (!check.ok) {
    return (
      <AuthCard subtitle={check.reason === "expired" ? "תוקף הקישור פג" : "קישור לא תקין"}>
        <LinkProblem
          text={
            check.reason === "expired"
              ? "תוקף הקישור פג (הקישור תקף לשעה אחת)."
              : "הקישור אינו תקין או שכבר נעשה בו שימוש."
          }
        />
      </AuthCard>
    );
  }

  return (
    <AuthCard subtitle={check.isInvite ? "השלמת הרשמה" : "קביעת סיסמה חדשה"}>
      <p className="mb-4 text-sm">
        שלום <strong>{check.user.fullName}</strong>,{" "}
        {check.isInvite ? "כדי להשלים את ההרשמה יש לבחור סיסמה." : "יש לבחור סיסמה חדשה."}
      </p>
      <SetPasswordForm oobCode={oobCode} username={check.user.username} />
    </AuthCard>
  );
}

function LinkProblem({ text }: { text: string }) {
  return (
    <div className="space-y-4 text-center text-sm">
      <p>{text}</p>
      <p className="text-fg-muted">אפשר לבקש קישור חדש, והוא יישלח למייל שלך.</p>
      <Link
        href="/forgot-password"
        className="inline-flex h-10 items-center rounded-lg bg-primary px-4 font-medium text-white hover:bg-primary-hover"
      >
        שליחת קישור חדש
      </Link>
    </div>
  );
}
