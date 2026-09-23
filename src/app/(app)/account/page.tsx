import type { Metadata } from "next";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireSessionUser } from "@/modules/auth/session";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "החשבון שלי" };

export default async function AccountPage() {
  const user = await requireSessionUser();
  return (
    <>
      <PageHeader title="החשבון שלי" />
      <div className="grid max-w-3xl gap-5">
        <Card>
          <CardHeader title="פרטים אישיים" />
          <CardBody>
            <dl className="grid gap-4 text-sm sm:grid-cols-3">
              <Detail label="שם מלא">{user.fullName}</Detail>
              <Detail label="שם משתמש">
                <span dir="ltr">{user.username}</span>
              </Detail>
              <Detail label="תפקיד">{user.roleName}</Detail>
            </dl>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="שינוי סיסמה" />
          <CardBody>
            <ChangePasswordForm />
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-fg-muted">{label}</dt>
      <dd className="mt-0.5 font-medium text-fg">{children}</dd>
    </div>
  );
}
