import type { ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeftRight,
  CalendarX2,
  CheckCircle2,
  ChevronLeft,
  ClipboardCheck,
  Clock,
  UserCheck,
  UserX,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/page-header";
import { cn } from "@/lib/cn";
import {
  addDays,
  formatDateWithDay,
  formatDayMonth,
  formatWeekRange,
  todayIso,
  WEEKDAY_SHORT,
  weekdayOf,
  weekStartOf,
} from "@/lib/dates";
import { agentName } from "@/modules/agents/types";
import { getAttendanceDay } from "@/modules/attendance/service";
import { summarizeAttendance, type AttendanceDay } from "@/modules/attendance/types";
import { countPendingApprovals } from "@/modules/approvals/service";
import { weekCoverage } from "@/modules/dashboard/service";
import type { WeekSummary } from "@/modules/dashboard/summary";
import { requireSessionUser } from "@/modules/auth/session";
import { can } from "@/modules/permissions/check";
import { getWeek, listUpcomingRejected } from "@/modules/schedule/service";
import { teamsForActor } from "@/modules/teams/service";
import { countIncomingTransfers } from "@/modules/transfers/service";

export default async function DashboardPage() {
  const user = await requireSessionUser();
  const today = todayIso();
  const thisWeek = weekStartOf(today);
  const nextWeek = addDays(thisWeek, 7);

  const teams = can(user, "schedule.view") ? await teamsForActor(user, "schedule.view") : [];
  const [approvals, transfers, weeks, rejected, coverage, attendance] = await Promise.all([
    can(user, "approvals.view") ? countPendingApprovals(user) : null,
    can(user, "transfers.decide") ? countIncomingTransfers(user) : 0,
    Promise.all(
      teams.map(async (t) => ({
        team: t,
        current: await getWeek(t.id, thisWeek),
        next: await getWeek(t.id, nextWeek),
      })),
    ),
    listUpcomingRejected(user, today),
    weekCoverage(user, teams, thisWeek),
    can(user, "attendance.view") ? getAttendanceDay(user, today) : null,
  ]);
  const gapDays = Object.values(coverage).reduce((n, c) => n + c.gaps, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">שלום, {user.fullName}</h1>
        <p className="text-sm text-fg-muted">{formatDateWithDay(today)}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {attendance && attendance.rows.length > 0 ? <AttendanceCard day={attendance} /> : null}
        {approvals ? (
          <StatCard
            href="/approvals"
            icon={<ClipboardCheck className="h-5 w-5" />}
            label={
              can(user, "approvals.decide")
                ? "בקשות ממתינות לאישור"
                : "שיבוצים בצוות שלך שממתינים לאישור"
            }
            value={approvals.pending}
            alert={approvals.urgent > 0 ? `${approvals.urgent} מהן בתאריך שכבר הגיע` : undefined}
          />
        ) : null}
        {can(user, "transfers.decide") ? (
          <StatCard
            href="/transfers"
            icon={<ArrowLeftRight className="h-5 w-5" />}
            label="בקשות העברה ממתינות"
            value={transfers}
          />
        ) : null}
        {rejected.length > 0 ? (
          <StatCard
            href="/schedule"
            icon={<XCircle className="h-5 w-5" />}
            label="שיבוצים שנדחו ודורשים שינוי"
            value={rejected.length}
            alert="יש לשנות את מיקום העבודה"
          />
        ) : null}
        {gapDays > 0 ? (
          <StatCard
            href="#teams"
            icon={<CalendarX2 className="h-5 w-5" />}
            label="ימים עם חוסר בנציגים השבוע"
            value={gapDays}
            alert="פחות מהמינימום בבוקר או בערב"
          />
        ) : null}
      </div>

      {teams.length > 0 ? (
        <section id="teams" className="scroll-mt-4">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="font-semibold">הצוותים השבוע</h2>
            <span className="text-xs text-fg-muted">
              {formatWeekRange(thisWeek)} · בכל יום: בוקר / ערב
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {weeks.map(({ team, current, next }) => (
              <TeamCard
                key={team.id}
                team={team}
                published={current.status === "published"}
                nextPublished={next.status === "published"}
                summary={coverage[team.id]}
                today={today}
                thisWeek={thisWeek}
                nextWeek={nextWeek}
              />
            ))}
          </div>
        </section>
      ) : null}

      {rejected.length > 0 ? (
        <Card>
          <CardHeader title="שיבוצים שנדחו" />
          <ul className="divide-y divide-border">
            {rejected.map(({ entry, agent }) => (
              <li key={entry.id}>
                <Link
                  href={`/schedule?team=${entry.teamId}&week=${entry.weekStart}`}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-muted sm:px-5"
                >
                  <span className="font-medium">{agent ? agentName(agent) : ""}</span>
                  <span className="text-fg-muted">{formatDateWithDay(entry.date)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {teams.length === 0 && !approvals ? (
        <Card>
          <EmptyState title="ברוכים הבאים" description="השתמשו בתפריט כדי לנווט במערכת" />
        </Card>
      ) : null}
    </div>
  );
}

/** Today's attendance for the shift running now: how many came, were late, or aren't marked. */
function AttendanceCard({ day }: { day: AttendanceDay }) {
  const shift = day.shifts.find((s) => s.id === day.currentShiftId);
  const rows = shift ? day.rows.filter((r) => r.shiftId === shift.id) : day.rows;
  const s = summarizeAttendance(rows, day.statuses);
  return (
    <Link href={`/attendance?date=${day.date}${shift ? `&shift=${shift.id}` : ""}`}>
      <Card className="flex items-center gap-4 p-4 transition hover:border-primary/40 hover:shadow">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <UserCheck className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-2xl font-bold tabular-nums">
            {s.present}
            <span className="text-base font-medium text-fg-muted"> / {s.planned}</span>
          </p>
          <p className="text-sm text-fg-muted">
            נוכחות{shift ? ` במשמרת ${shift.name}` : " היום"}
            {s.late ? ` · ${s.late} איחורים` : ""}
            {s.absent ? ` · ${s.absent} לא הגיעו` : ""}
          </p>
          {s.unmarked > 0 ? (
            <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-warning-fg">
              <Clock className="h-3.5 w-3.5" />
              {s.unmarked} עוד לא סומנו
            </p>
          ) : null}
        </div>
      </Card>
    </Link>
  );
}

function StatCard({
  href,
  icon,
  label,
  value,
  alert,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  value: number;
  alert?: string;
}) {
  return (
    <Link href={href}>
      <Card className="flex items-center gap-4 p-4 transition hover:border-primary/40 hover:shadow">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-sm text-fg-muted">{label}</p>
          {alert && value > 0 ? (
            <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-danger">
              <AlertTriangle className="h-3.5 w-3.5" />
              {alert}
            </p>
          ) : null}
        </div>
      </Card>
    </Link>
  );
}

function TeamCard({
  team,
  published,
  nextPublished,
  summary,
  today,
  thisWeek,
  nextWeek,
}: {
  team: { id: string; name: string; minMorning: number; minEvening: number };
  published: boolean;
  nextPublished: boolean;
  summary: WeekSummary;
  today: string;
  thisWeek: string;
  nextWeek: string;
}) {
  const href = (week: string) => `/schedule?team=${team.id}&week=${week}`;
  return (
    <Card className="overflow-hidden transition hover:border-primary/40 hover:shadow">
      <Link href={href(thisWeek)} className="block p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="min-w-0">
            <span className="font-semibold">{team.name}</span>
            {team.minMorning || team.minEvening ? (
              <span className="ms-2 text-xs text-fg-muted">
                מינימום {team.minMorning} / {team.minEvening}
              </span>
            ) : null}
          </span>
          <span className="flex items-center gap-1 text-xs text-fg-muted">
            <Badge tone={published ? "success" : "neutral"}>{published ? "פורסם" : "טיוטה"}</Badge>
            <ChevronLeft className="h-4 w-4" />
          </span>
        </div>
        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: `repeat(${summary.days.length}, minmax(0, 1fr))` }}
        >
          {summary.days.map((d) => (
            <div
              key={d.date}
              title={
                d.workable
                  ? `בוקר ${d.morning}${d.eveningExpected ? ` · ערב ${d.evening}` : ""}${d.absent ? ` · נעדרים ${d.absent}` : ""}${d.unassigned ? ` · ${d.unassigned} לא שובצו` : ""}`
                  : "לא עובדים"
              }
              className={cn(
                "rounded-lg border px-1 py-1.5 text-center text-[11px] leading-tight",
                !d.workable && "border-dashed border-border text-fg-subtle",
                d.workable && !d.gap && "border-border bg-muted/50",
                d.gap && "border-danger/30 bg-danger/10 text-danger",
                d.date === today && "ring-2 ring-primary/50",
              )}
            >
              <div className="font-semibold">{WEEKDAY_SHORT[weekdayOf(d.date)]}</div>
              <div className="text-fg-subtle">{formatDayMonth(d.date)}</div>
              {d.workable ? (
                <div className="mt-1 font-medium tabular-nums">
                  <span>{d.morning}</span>
                  {d.eveningExpected ? <span className="text-fg-muted"> / {d.evening}</span> : null}
                </div>
              ) : (
                <div className="mt-1">—</div>
              )}
            </div>
          ))}
        </div>
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/40 px-4 py-2 text-xs">
        <span className="flex flex-wrap items-center gap-3">
          {summary.gaps > 0 ? (
            <span className="flex items-center gap-1 font-medium text-danger">
              <CalendarX2 className="h-3.5 w-3.5" />
              {summary.gaps === 1 ? "יום אחד עם חוסר" : `${summary.gaps} ימים עם חוסר`}
            </span>
          ) : null}
          {summary.unassigned > 0 ? (
            <span className="flex items-center gap-1 font-medium text-warning-fg">
              <UserX className="h-3.5 w-3.5" />
              {summary.unassigned} משבצות לא שובצו
            </span>
          ) : null}
          {summary.agents === 0 ? (
            <span className="text-fg-muted">אין נציגים פעילים בצוות</span>
          ) : summary.gaps === 0 && summary.unassigned === 0 ? (
            <span className="flex items-center gap-1 font-medium text-success">
              <CheckCircle2 className="h-3.5 w-3.5" />
              כל הנציגים שובצו
            </span>
          ) : null}
        </span>
        <Link href={href(nextWeek)} className="flex items-center gap-1 text-fg-muted hover:text-fg">
          שבוע הבא:
          <Badge tone={nextPublished ? "success" : "neutral"}>
            {nextPublished ? "פורסם" : "טיוטה"}
          </Badge>
        </Link>
      </div>
    </Card>
  );
}
