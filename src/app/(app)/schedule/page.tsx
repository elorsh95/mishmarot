import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { isIsoDate, todayIso, weekStartOf } from "@/lib/dates";
import { requireSessionUser } from "@/modules/auth/session";
import { getCatalog } from "@/modules/catalog/service";
import { canForTeam } from "@/modules/permissions/check";
import { getWeekSeatUsage, getWeekView } from "@/modules/schedule/service";
import { teamsForActor } from "@/modules/teams/service";
import { AllTeamsBoard } from "./all-teams-board";
import { ScheduleBoard } from "./schedule-board";

export const metadata: Metadata = { title: "סידור עבודה" };

export default async function SchedulePage({ searchParams }: PageProps<"/schedule">) {
  const user = await requireSessionUser();
  const params = await searchParams;
  const teams = await teamsForActor(user, "schedule.view");
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

  const requestedTeam = typeof params.team === "string" ? params.team : undefined;
  const allTeams = requestedTeam === "all" && teams.length > 1;
  const team = teams.find((t) => t.id === requestedTeam) ?? teams[0];
  const weekParam = typeof params.week === "string" && isIsoDate(params.week) ? params.week : null;
  const weekStart = weekStartOf(weekParam ?? todayIso());
  if (weekParam && weekParam !== weekStart) {
    redirect(`/schedule?team=${allTeams ? "all" : team.id}&week=${weekStart}`);
  }

  if (allTeams) {
    const [views, catalog, seats] = await Promise.all([
      Promise.all(teams.map((t) => getWeekView(user, t.id, weekStart))),
      getCatalog(),
      getWeekSeatUsage(user, weekStart),
    ]);
    return (
      <AllTeamsBoard
        views={views}
        catalog={catalog}
        seats={seats}
        weekStart={weekStart}
        label={views[0].label}
      />
    );
  }

  const [view, catalog, seats] = await Promise.all([
    getWeekView(user, team.id, weekStart),
    getCatalog(),
    getWeekSeatUsage(user, weekStart),
  ]);

  return (
    <ScheduleBoard
      view={view}
      catalog={catalog}
      teams={teams.map((t) => ({ id: t.id, name: t.name }))}
      canViewAgents={canForTeam(user, "agents.view", team.id)}
      seats={seats}
    />
  );
}
