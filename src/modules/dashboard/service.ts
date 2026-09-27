import { col, COLLECTIONS, fromDoc } from "@/lib/firebase/collections";
import { weekDates, type IsoDate } from "@/lib/dates";
import { getDayInfos } from "@/modules/calendar/service";
import { getCatalog } from "@/modules/catalog/service";
import { assertCanForTeam, type Actor } from "@/modules/permissions/check";
import type { Assignment } from "@/modules/schedule/types";
import type { Team } from "@/modules/teams/service";
import { summarizeWeek, weekDays, type WeekSummary } from "./summary";

/** This week's coverage for each of the given teams (schedule.view on each). */
export async function weekCoverage(
  actor: Actor,
  teams: Array<Pick<Team, "id" | "minMorning" | "minEvening">>,
  weekStart: IsoDate,
): Promise<Record<string, WeekSummary>> {
  for (const t of teams) assertCanForTeam(actor, "schedule.view", t.id);
  const catalog = await getCatalog();
  const days = weekDays(weekDates(weekStart), catalog.shifts);
  const dayInfo = await getDayInfos(days);
  const results = await Promise.all(
    teams.map(async ({ id: teamId, minMorning, minEvening }) => {
      const [entries, agents] = await Promise.all([
        col(COLLECTIONS.assignments)
          .where("teamId", "==", teamId)
          .where("weekStart", "==", weekStart)
          .get(),
        col(COLLECTIONS.agents)
          .where("teamId", "==", teamId)
          .where("isActive", "==", true)
          .select()
          .get(),
      ]);
      const summary = summarizeWeek({
        days,
        dayInfo,
        shifts: catalog.shifts,
        agentIds: agents.docs.map((d) => d.id),
        entries: entries.docs.map((d) => fromDoc<Assignment>(d)),
        min: { morning: minMorning, evening: minEvening },
      });
      return [teamId, summary] as const;
    }),
  );
  return Object.fromEntries(results);
}
