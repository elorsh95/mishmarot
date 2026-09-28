import ExcelJS from "exceljs";
import { formatDateTime } from "@/lib/dates";
import { xlsxResponse } from "@/lib/xlsx-response";
import { logAccess } from "@/modules/access/service";
import { getSessionUser } from "@/modules/auth/session";
import { SCOPE_LABELS } from "@/modules/permissions/catalog";
import { can } from "@/modules/permissions/check";
import { permissionReview } from "@/modules/security/service";

/** The permissions review as Excel, to keep with the review records. */
export async function GET() {
  const user = await getSessionUser();
  if (!user || user.mfaSetupRequired) return new Response(null, { status: 401 });
  if (!can(user, "users.manage")) {
    await logAccess(user, {
      action: "denied",
      resource: "users",
      detail: "ניסיון לייצא בדיקת הרשאות",
    });
    return new Response(null, { status: 403 });
  }
  const { rows } = await permissionReview(user);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("הרשאות", {
    views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }],
  });
  ws.columns = [
    { header: "שם מלא", width: 22 },
    { header: "שם משתמש", width: 16 },
    { header: "סטטוס", width: 10 },
    { header: "תפקיד", width: 16 },
    { header: "צוותים בניהולו", width: 22 },
    { header: "אימות דו-שלבי", width: 12 },
    { header: "כניסה אחרונה", width: 18 },
    { header: "הרשאות", width: 70 },
    { header: "דורש תשומת לב", width: 40 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const r of rows) {
    const row = ws.addRow([
      r.fullName,
      r.username,
      r.isActive ? "פעיל" : "מושבת",
      r.roleName,
      r.teams.join(", "),
      r.mfaEnabled ? "כן" : "לא",
      r.lastLoginAt ? formatDateTime(r.lastLoginAt) : "מעולם לא",
      r.permissions.map((p) => `${p.label} (${SCOPE_LABELS[p.scope]})`).join("\n"),
      r.flags.join("\n"),
    ]);
    row.alignment = { vertical: "top", wrapText: true };
  }
  await logAccess(user, {
    action: "export",
    resource: "users",
    detail: "ייצוא בדיקת הרשאות לאקסל",
  });
  const date = new Date().toISOString().slice(0, 10);
  return xlsxResponse(
    Buffer.from(await wb.xlsx.writeBuffer()),
    `בדיקת הרשאות ${date}.xlsx`,
    `permissions-review-${date}.xlsx`,
  );
}
