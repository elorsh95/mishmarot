import type { NextRequest } from "next/server";
import { formatMonth, monthOf, todayIso } from "@/lib/dates";
import { xlsxResponse } from "@/lib/xlsx-response";
import { getSessionUser } from "@/modules/auth/session";
import { can } from "@/modules/permissions/check";
import { monthlyReportXlsx } from "@/modules/reports/excel";
import { monthlyReport } from "@/modules/reports/service";

/** Monthly report as Excel: ?month=YYYY-MM&team=<id> (team optional). */
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return new Response(null, { status: 401 });
  if (!can(user, "schedule.view")) return new Response(null, { status: 403 });
  const params = request.nextUrl.searchParams;
  const monthParam = params.get("month") ?? "";
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam) ? monthParam : monthOf(todayIso());
  const report = await monthlyReport(user, month, params.get("team") || null);
  const name = `דוח חודשי - ${report.teamName ?? "כל הצוותים"} - ${formatMonth(month)}.xlsx`;
  return xlsxResponse(await monthlyReportXlsx(report), name, `report-${month}.xlsx`);
}
