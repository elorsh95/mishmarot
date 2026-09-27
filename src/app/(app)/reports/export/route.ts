import type { NextRequest } from "next/server";
import { todayIso } from "@/lib/dates";
import { xlsxResponse } from "@/lib/xlsx-response";
import { getSessionUser } from "@/modules/auth/session";
import { can } from "@/modules/permissions/check";
import { reportXlsx } from "@/modules/reports/excel";
import { parseReportRange, reportRangeLabel } from "@/modules/reports/period";
import { scheduleReport } from "@/modules/reports/service";

/** The report as Excel, with the page's params: period/date or from/to, team, view. */
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return new Response(null, { status: 401 });
  if (!can(user, "schedule.view")) return new Response(null, { status: 403 });
  const params = Object.fromEntries(request.nextUrl.searchParams);
  const range = parseReportRange(params, todayIso());
  const view = params.view === "shifts" ? "shifts" : "agents";
  const report = await scheduleReport(user, range, params.team || null);
  const title = view === "shifts" ? "דוח משמרות" : "דוח נציגים";
  // File names can't hold "/", which the date labels use.
  const label = reportRangeLabel(range).replaceAll("/", ".");
  const name = `${title} - ${report.teamName ?? "כל הצוותים"} - ${label}.xlsx`;
  return xlsxResponse(
    await reportXlsx(report, view),
    name,
    `report-${view}-${range.from}-${range.to}.xlsx`,
  );
}
