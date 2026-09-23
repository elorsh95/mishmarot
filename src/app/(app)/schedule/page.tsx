import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { isIsoDate, todayIso, weekStartOf } from "@/lib/dates";
import { requireSessionUser } from "@/modules/auth/session";
import { getCatalog } from "@/modules/catalog/service";
import { canForTeam } from "@/modules/permissions/check";
import { getWeekView } from "@/modules/schedule/service";
import { teamsForActor } from "@/modules/teams/service";
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
  const team = teams.find((t) => t.id === requestedTeam) ?? teams[0];
  const weekParam = typeof params.week === "string" && isIsoDate(params.week) ? params.week : null;
  const weekStart = weekStartOf(weekParam ?? todayIso());
  if (weekParam && weekParam !== weekStart) {
    redirect(`/schedule?team=${team.id}&week=${weekStart}`);
  }

  const [view, catalog] = await Promise.all([getWeekView(user, team.id, weekStart), getCatalog()]);

  return (
    <ScheduleBoard
      view={view}
      catalog={catalog}
      teams={teams.map((t) => ({ id: t.id, name: t.name }))}
      canViewAgents={canForTeam(user, "agents.view", team.id)}
    />
  );
}
