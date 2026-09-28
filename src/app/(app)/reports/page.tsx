import { logAccess } from "@/modules/access/service";
import { deniedPage } from "@/modules/access/pages";
import type { Metadata } from "next";
import { todayIso } from "@/lib/dates";
import { PageHeader } from "@/components/ui/page-header";
import { requireSessionUser } from "@/modules/auth/session";
import { can } from "@/modules/permissions/check";
import { parseReportRange, reportRangeLabel } from "@/modules/reports/period";
import { scheduleReport } from "@/modules/reports/service";
import { QUOTA_PERIOD_LABELS } from "@/modules/schedule/types";
import { teamsForActor } from "@/modules/teams/service";
import { ReportFilters } from "./report-filters";
import { AgentReportTable, ShiftReportTables } from "./report-tables";

export const metadata: Metadata = { title: "דוחות" };

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const user = await requireSessionUser();
  if (!can(user, "schedule.view")) await deniedPage(user, "דוחות");
  const params = await searchParams;
  const range = parseReportRange(params, todayIso());
  const view = params.view === "shifts" ? "shifts" : "agents";
  const teams = await teamsForActor(user, "schedule.view", { includeInactive: true });
  const teamId =
    typeof params.team === "string" && teams.some((t) => t.id === params.team) ? params.team : "";
  const report = await scheduleReport(user, range, teamId || null);
  await logAccess(user, {
    action: "view",
    resource: "reports",
    detail: `דוחות · ${report.teamName ?? "כל הצוותים"} · ${reportRangeLabel(range)}`,
    teamId: teamId || null,
  });

  return (
    <>
      <PageHeader
        title="דוחות"
        description={
          view === "shifts"
            ? "כמה שובצו בכל משמרת, לפי מיקום ויום בשבוע"
            : "ימי עבודה, ימי בית והיעדרויות לכל נציג"
        }
      />
      <ReportFilters
        range={range}
        view={view}
        teamId={teamId}
        teams={teams.map((t) => ({ id: t.id, name: t.name }))}
      />
      {view === "shifts" ? (
        <ShiftReportTables report={report} />
      ) : (
        <AgentReportTable report={report} showTeam={!teamId && teams.length > 1} />
      )}
      <p className="mt-2 text-xs text-fg-muted">
        {view === "shifts"
          ? "שיבוצים הם ימי עבודה של נציגים במשמרת. ממוצע ליום הוא מספר הנציגים הממוצע בימים שבהם המשמרת אוישה."
          : `ימי בית כוללים ימים במסגרת המכסה וימים שאושרו מעבר לה. ימים שממתינים לאישור או שנדחו מוצגים בנפרד. המכסה נספרת ${QUOTA_PERIOD_LABELS[report.quotaPeriod].per}; נציג שחרג ממנה בתקופה מסומן בכתום. לחיצה על כותרת עמודה ממיינת לפיה.`}
      </p>
    </>
  );
}
