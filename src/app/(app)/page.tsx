import type { ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeftRight, CalendarDays, ClipboardCheck, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/page-header";
import { addDays, formatDateWithDay, formatWeekRange, todayIso, weekStartOf } from "@/lib/dates";
import { agentName } from "@/modules/agents/types";
import { countPendingApprovals } from "@/modules/approvals/service";
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
  const [approvals, transfers, weeks, rejected] = await Promise.all([
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
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">שלום, {user.fullName}</h1>
        <p className="text-sm text-fg-muted">{formatDateWithDay(today)}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
      </div>

      {teams.length > 0 ? (
        <Card>
          <CardHeader title="סידורי עבודה" description="סטטוס הסידור השבועי לפי צוות" />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-fg-muted">
                  <th className="px-4 py-2 text-start font-semibold sm:px-5">צוות</th>
                  <th className="px-4 py-2 text-start font-semibold">
                    השבוע ({formatWeekRange(thisWeek)})
                  </th>
                  <th className="px-4 py-2 text-start font-semibold">
                    שבוע הבא ({formatWeekRange(nextWeek)})
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border border-t border-border">
                {weeks.map(({ team, current, next }) => (
                  <tr key={team.id}>
                    <td className="px-4 py-2.5 font-medium sm:px-5">{team.name}</td>
                    {[
                      { week: current, start: thisWeek },
                      { week: next, start: nextWeek },
                    ].map(({ week, start }) => (
                      <td key={start} className="px-4 py-2.5">
                        <Link
                          href={`/schedule?team=${team.id}&week=${start}`}
                          className="inline-flex items-center gap-2 hover:underline"
                        >
                          <CalendarDays className="h-4 w-4 text-fg-subtle" />
                          <Badge tone={week.status === "published" ? "success" : "neutral"}>
                            {week.status === "published" ? "פורסם" : "טיוטה"}
                          </Badge>
                        </Link>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
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
