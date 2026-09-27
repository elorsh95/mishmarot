import { col, COLLECTIONS, fromDoc } from "@/lib/firebase/collections";
import { db } from "@/lib/firebase/admin";
import type { IsoMonth } from "@/lib/dates";
import { agentName, type Agent } from "@/modules/agents/types";
import { getCatalog } from "@/modules/catalog/service";
import { teamScope, type Actor } from "@/modules/permissions/check";
import type { Assignment } from "@/modules/schedule/types";
import { getSettings } from "@/modules/settings/service";
import { listAllTeams } from "@/modules/teams/service";
import { aggregateMonth } from "./aggregate";
import type { MonthlyReport } from "./types";

/**
 * Monthly summary per agent for the teams the actor can view (schedule.view).
 * Entries count toward the team they were scheduled in, so an agent who moved teams mid-month
 * appears in each team with that team's days. Active agents with no entries are listed too.
 */
export async function monthlyReport(
  actor: Actor,
  month: IsoMonth,
  teamId: string | null,
): Promise<MonthlyReport> {
  const scope = teamScope(actor, "schedule.view");
  const teams = (await listAllTeams()).filter((t) => scope === "all" || scope.includes(t.id));
  const selected = teamId ? teams.filter((t) => t.id === teamId) : teams;
  const [catalog, settings] = await Promise.all([getCatalog(), getSettings()]);
  const empty: MonthlyReport = {
    month,
    teamName: teamId ? (selected[0]?.name ?? null) : null,
    quotaPeriod: settings.quotaPeriod,
    shifts: catalog.shifts.map((s) => ({ id: s.id, name: s.name })),
    absences: catalog.absenceTypes.map((a) => ({ id: a.id, name: a.name })),
    rows: [],
  };
  if (selected.length === 0) return empty;

  const teamIds = new Set(selected.map((t) => t.id));
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const [entrySnaps, agentSnaps] = await Promise.all([
    Promise.all(
      selected.map((t) =>
        col(COLLECTIONS.assignments).where("teamId", "==", t.id).where("month", "==", month).get(),
      ),
    ),
    Promise.all(selected.map((t) => col(COLLECTIONS.agents).where("teamId", "==", t.id).get())),
  ]);
  const entries = entrySnaps.flatMap((s) => s.docs.map((d) => fromDoc<Assignment>(d)));
  const agents = new Map(
    agentSnaps.flatMap((s) => s.docs.map((d) => fromDoc<Agent>(d))).map((a) => [a.id, a]),
  );
  // Agents who have entries in these teams but have since moved elsewhere.
  const missing = [...new Set(entries.map((e) => e.agentId))].filter((id) => !agents.has(id));
  if (missing.length > 0) {
    const snaps = await db().getAll(...missing.map((id) => col(COLLECTIONS.agents).doc(id)));
    for (const s of snaps.filter((x) => x.exists)) agents.set(s.id, fromDoc<Agent>(s));
  }

  // One row per agent and team they had entries in (or belong to, if active).
  const keyOf = (agentId: string, team: string) => `${agentId}|${team}`;
  const keys = new Map<string, { agent: Agent; teamId: string }>();
  for (const a of agents.values()) {
    if (a.isActive && teamIds.has(a.teamId))
      keys.set(keyOf(a.id, a.teamId), { agent: a, teamId: a.teamId });
  }
  for (const e of entries) {
    const agent = agents.get(e.agentId);
    if (agent) keys.set(keyOf(e.agentId, e.teamId), { agent, teamId: e.teamId });
  }

  const quotaLocations = new Set(catalog.locations.filter((l) => l.requiresQuota).map((l) => l.id));
  const rows = aggregateMonth(
    [...keys.entries()].map(([key, { agent, teamId: t }]) => ({
      agentId: key,
      agentName: agentName(agent),
      employeeNumber: agent.employeeNumber ?? "",
      teamName: teamName.get(t) ?? "",
      isActive: agent.isActive,
      quota: agent.monthlyQuota ?? settings.defaultMonthlyQuota,
    })),
    entries.map((e) => ({ ...e, agentId: keyOf(e.agentId, e.teamId) })),
    quotaLocations,
  )
    .map((r) => ({ ...r, agentId: r.agentId.split("|")[0] }))
    .sort(
      (a, b) =>
        a.teamName.localeCompare(b.teamName, "he") || a.agentName.localeCompare(b.agentName, "he"),
    );

  return { ...empty, rows };
}
