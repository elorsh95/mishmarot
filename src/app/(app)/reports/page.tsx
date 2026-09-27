import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { Table, Td, Th } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { monthOf, todayIso } from "@/lib/dates";
import { requireSessionUser } from "@/modules/auth/session";
import { can } from "@/modules/permissions/check";
import { monthlyReport } from "@/modules/reports/service";
import { homeDays } from "@/modules/reports/types";
import { teamsForActor } from "@/modules/teams/service";
import { ReportFilters } from "./report-filters";

export const metadata: Metadata = { title: "דוחות" };

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const user = await requireSessionUser();
  if (!can(user, "schedule.view")) notFound();
  const params = await searchParams;
  const month =
    typeof params.month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month)
      ? params.month
      : monthOf(todayIso());
  const teams = await teamsForActor(user, "schedule.view", { includeInactive: true });
  const teamId =
    typeof params.team === "string" && teams.some((t) => t.id === params.team) ? params.team : "";
  const report = await monthlyReport(user, month, teamId || null);
  const showTeam = !teamId && teams.length > 1;

  const total = (pick: (r: (typeof report.rows)[number]) => number) =>
    report.rows.reduce((sum, r) => sum + pick(r), 0);

  return (
    <>
      <PageHeader
        title="דוח חודשי"
        description="ימי עבודה, ימי בית והיעדרויות לכל נציג בחודש קלנדרי"
      />
      <ReportFilters
        month={month}
        teamId={teamId}
        teams={teams.map((t) => ({ id: t.id, name: t.name }))}
      />
      <Card>
        {report.rows.length === 0 ? (
          <EmptyState title="אין נתונים לחודש זה" />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <thead>
                <tr>
                  <Th>נציג</Th>
                  {showTeam ? <Th>צוות</Th> : null}
                  <Th className="text-center">ימי עבודה</Th>
                  {report.shifts.map((s) => (
                    <Th key={s.id} className="text-center">
                      {s.name}
                    </Th>
                  ))}
                  <Th className="text-center">ימי בית</Th>
                  <Th className="text-center">ממתין / נדחה</Th>
                  {report.absences.map((a) => (
                    <Th key={a.id} className="text-center">
                      {a.name}
                    </Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr
                    key={`${r.agentId}-${r.teamName}`}
                    className={cn(!r.isActive && "text-fg-muted")}
                  >
                    <Td className="font-medium">
                      {r.agentName}
                      {!r.isActive ? <span className="text-xs"> (לא פעיל)</span> : null}
                    </Td>
                    {showTeam ? <Td>{r.teamName}</Td> : null}
                    <Td className="text-center font-semibold">{r.workDays}</Td>
                    {report.shifts.map((s) => (
                      <Td key={s.id} className="text-center">
                        {r.byShift[s.id] ?? 0}
                      </Td>
                    ))}
                    <Td className="text-center">
                      <Badge tone={homeDays(r) > r.quota ? "warning" : "neutral"}>
                        <span dir="ltr">
                          {homeDays(r)}/{r.quota}
                        </span>
                      </Badge>
                    </Td>
                    <Td className="text-center text-fg-muted">
                      {r.home.pending || r.home.rejected
                        ? `${r.home.pending} / ${r.home.rejected}`
                        : "—"}
                    </Td>
                    {report.absences.map((a) => (
                      <Td key={a.id} className="text-center">
                        {r.byAbsence[a.id] ?? 0}
                      </Td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/60 font-semibold">
                  <Td>סה״כ</Td>
                  {showTeam ? <Td /> : null}
                  <Td className="text-center">{total((r) => r.workDays)}</Td>
                  {report.shifts.map((s) => (
                    <Td key={s.id} className="text-center">
                      {total((r) => r.byShift[s.id] ?? 0)}
                    </Td>
                  ))}
                  <Td className="text-center">{total(homeDays)}</Td>
                  <Td className="text-center">
                    {total((r) => r.home.pending)} / {total((r) => r.home.rejected)}
                  </Td>
                  {report.absences.map((a) => (
                    <Td key={a.id} className="text-center">
                      {total((r) => r.byAbsence[a.id] ?? 0)}
                    </Td>
                  ))}
                </tr>
              </tfoot>
            </Table>
          </div>
        )}
      </Card>
      <p className="mt-2 text-xs text-fg-muted">
        ימי בית כוללים ימים במסגרת המכסה וימים שאושרו מעבר לה. ימים שממתינים לאישור או שנדחו מוצגים
        בנפרד.
      </p>
    </>
  );
}
