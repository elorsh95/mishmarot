import { logAccess } from "@/modules/access/service";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { formatDayMonth, isIsoDate, todayIso, weekStartOf } from "@/lib/dates";
import { requireSessionUser } from "@/modules/auth/session";
import { getCatalog } from "@/modules/catalog/service";
import { canForTeam } from "@/modules/permissions/check";
import { getWeekSeatUsage, getWeekView } from "@/modules/schedule/service";
import { listActivities, teamsForActor } from "@/modules/teams/service";
import { resolveTeamSelection } from "@/modules/teams/types";
import { AllTeamsBoard } from "./all-teams-board";
import { ScheduleBoard } from "./schedule-board";

export const metadata: Metadata = { title: "סידור עבודה" };

export default async function SchedulePage({ searchParams }: PageProps<"/schedule">) {
  const user = await requireSessionUser();
  const params = await searchParams;
  const [teams, activities] = await Promise.all([
    teamsForActor(user, "schedule.view"),
    listActivities(),
  ]);
  if (teams.length === 0) {
    return (
      <>
        <PageHeader title="סידור עבודה" />
        <Card>
          <EmptyState
            title="אין צוותים להצגה"
            description="לא שויכו אליך צוותים. יש לפנות למנהל המערכת."
          />
        </Card>
      </>
    );
  }

  // A team id, "all" or an activity ("act:<id>"); anything else opens the first team.
  const selection = resolveTeamSelection(
    typeof params.team === "string" ? params.team : undefined,
    teams,
    activities,
  ) ?? { kind: "team" as const, value: teams[0].id, team: teams[0], label: teams[0].name };
  const weekParam = typeof params.week === "string" && isIsoDate(params.week) ? params.week : null;
  const weekStart = weekStartOf(weekParam ?? todayIso());
  if (weekParam && weekParam !== weekStart) {
    redirect(`/schedule?team=${encodeURIComponent(selection.value)}&week=${weekStart}`);
  }
  const teamOptions = teams.map((t) => ({ id: t.id, name: t.name, activityId: t.activityId }));

  if (selection.kind === "multi") {
    const [views, catalog, seats] = await Promise.all([
      Promise.all(selection.teams.map((t) => getWeekView(user, t.id, weekStart))),
      getCatalog(),
      getWeekSeatUsage(user, weekStart),
    ]);
    await logAccess(user, {
      action: "view",
      resource: "schedule",
      detail: `סידור עבודה · ${selection.label} · שבוע ${formatDayMonth(weekStart)}`,
    });
    return (
      <AllTeamsBoard
        views={views}
        catalog={catalog}
        seats={seats}
        weekStart={weekStart}
        label={views[0].label}
        selection={{
          value: selection.value,
          label: selection.label,
          isActivity: selection.activity !== null,
        }}
        teams={teamOptions}
        activities={activities}
      />
    );
  }
  const team = selection.team;

  const [view, catalog, seats] = await Promise.all([
    getWeekView(user, team.id, weekStart),
    getCatalog(),
    getWeekSeatUsage(user, weekStart),
  ]);
  await logAccess(user, {
    action: "view",
    resource: "schedule",
    detail: `סידור עבודה · ${team.name} · שבוע ${formatDayMonth(weekStart)}`,
    teamId: team.id,
  });

  return (
    <ScheduleBoard
      view={view}
      catalog={catalog}
      teams={teamOptions}
      activities={activities}
      canViewAgents={canForTeam(user, "agents.view", team.id)}
      seats={seats}
    />
  );
}
