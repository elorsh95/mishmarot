import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ChevronRight, FileSpreadsheet, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Table, Td, Th } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/dates";
import { deniedPage } from "@/modules/access/pages";
import { logAccess } from "@/modules/access/service";
import { requireSessionUser } from "@/modules/auth/session";
import { SCOPE_LABELS } from "@/modules/permissions/catalog";
import { can } from "@/modules/permissions/check";
import { permissionReview } from "@/modules/security/service";
import { MarkReviewed } from "./mark-reviewed";

export const metadata: Metadata = { title: "בדיקת הרשאות" };

/** The periodic review of users and permissions the data security regulations call for. */
export default async function PermissionReviewPage() {
  const user = await requireSessionUser();
  if (!can(user, "users.manage")) await deniedPage(user, "בדיקת הרשאות");
  const { rows, lastReview } = await permissionReview(user);
  await logAccess(user, { action: "view", resource: "users", detail: "בדיקת הרשאות" });
  const active = rows.filter((r) => r.isActive);
  const flagged = active.filter((r) => r.flags.length > 0);

  return (
    <>
      <Link
        href="/users"
        className="mb-2 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"
      >
        <ChevronRight className="h-4 w-4" />
        משתמשים
      </Link>
      <PageHeader
        title="בדיקת הרשאות תקופתית"
        description="כל המשתמשים, התפקיד וההרשאות של כל אחד, ומה דורש תשומת לב. מומלץ לבדוק לפחות פעם ברבעון ולתעד."
        actions={
          <a
            href="/users/review/export"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-medium hover:bg-muted"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Excel
          </a>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-2xl font-bold">{active.length}</p>
          <p className="text-sm text-fg-muted">משתמשים פעילים</p>
        </Card>
        <Card className="p-4">
          <p className={cn("text-2xl font-bold", flagged.length > 0 && "text-warning-fg")}>
            {flagged.length}
          </p>
          <p className="text-sm text-fg-muted">דורשים תשומת לב</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm font-medium">
            {lastReview ? formatDateTime(lastReview.at) : "עוד לא בוצעה בדיקה"}
          </p>
          <p className="text-sm text-fg-muted">
            {lastReview ? `בדיקה אחרונה, ע״י ${lastReview.byName}` : "תעדו את הבדיקה הראשונה"}
          </p>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <Th>משתמש</Th>
                <Th>תפקיד</Th>
                <Th>הרשאות</Th>
                <Th>כניסה אחרונה</Th>
                <Th>דורש תשומת לב</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.userId} className={cn("align-top", !r.isActive && "opacity-60")}>
                  <Td>
                    <p className="font-medium">{r.fullName}</p>
                    <p className="text-xs text-fg-muted" dir="ltr">
                      {r.username}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {r.isActive ? null : <Badge tone="danger">מושבת</Badge>}
                      {r.mfaEnabled ? (
                        <Badge tone="primary">
                          <ShieldCheck className="h-3 w-3" />
                          2FA
                        </Badge>
                      ) : null}
                    </div>
                  </Td>
                  <Td>
                    {r.roleName}
                    {r.teams.length ? (
                      <p className="text-xs text-fg-muted">צוותים: {r.teams.join(", ")}</p>
                    ) : null}
                  </Td>
                  <Td>
                    <details>
                      <summary className="cursor-pointer text-sm text-primary">
                        {r.permissions.length} הרשאות
                      </summary>
                      <ul className="mt-1 space-y-0.5 text-xs">
                        {r.permissions.map((p) => (
                          <li key={p.label}>
                            {p.label}
                            <span className="text-fg-muted"> · {SCOPE_LABELS[p.scope]}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  </Td>
                  <Td className="whitespace-nowrap text-fg-muted">
                    {r.lastLoginAt ? formatDateTime(r.lastLoginAt) : "מעולם לא"}
                  </Td>
                  <Td>
                    {r.flags.length ? (
                      <ul className="space-y-0.5 text-xs text-warning-fg">
                        {r.flags.map((f) => (
                          <li key={f} className="flex items-start gap-1">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            {f}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-xs text-fg-muted">—</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </Card>

      <MarkReviewed />
    </>
  );
}
