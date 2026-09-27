import { col, COLLECTIONS, fromDoc } from "@/lib/firebase/collections";
import { db } from "@/lib/firebase/admin";
import { addMonths, monthOf } from "@/lib/dates";
import { agentName, type Agent } from "@/modules/agents/types";
import { getCatalog } from "@/modules/catalog/service";
import { teamScope, type Actor } from "@/modules/permissions/check";
import type { Assignment } from "@/modules/schedule/types";
import { getSettings } from "@/modules/settings/service";
import { listAllTeams } from "@/modules/teams/service";
import { aggregateAgents, aggregateShifts } from "./aggregate";
import type { ReportRange } from "./period";
import type { Report } from "./types";

/**
 * Summary of a date range for the teams the actor can view (schedule.view): per agent and per shift.
 * Entries count toward the team they were scheduled in, so an agent who moved teams during the
 * range appears in each team with that team's days. Active agents with no entries are listed too.
 */
export async function scheduleReport(
  actor: Actor,
  range: ReportRange,
  teamId: string | null,
): Promise<Report> {
  const scope = teamScope(actor, "schedule.view");
  const teams = (await listAllTeams()).filter((t) => scope === "all" || scope.includes(t.id));
  const selected = teamId ? teams.filter((t) => t.id === teamId) : teams;
  const [catalog, settings] = await Promise.all([getCatalog(), getSettings()]);
  const shifts = catalog.shifts.map((s) => ({ id: s.id, name: s.name }));
  const absences = catalog.absenceTypes.map((a) => ({ id: a.id, name: a.name }));
  const empty: Report = {
    range,
    teamName: teamId ? (selected[0]?.name ?? null) : null,
    quotaPeriod: settings.quotaPeriod,
    shifts,
    absences,
    locations: catalog.locations.map((l) => ({ id: l.id, name: l.name })),
    rows: [],
    ...aggregateShifts(shifts, absences, []),
  };
  if (selected.length === 0) return empty;

  // Equality filters only (team and month), which Firestore serves without a composite index;
  // the days outside the range are dropped below. A range spans at most 13 months (`in` takes 30).
  const months: string[] = [];
  for (let m = monthOf(range.from); m <= monthOf(range.to); m = addMonths(m, 1)) months.push(m);
  const teamIds = new Set(selected.map((t) => t.id));
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const [entrySnaps, agentSnaps] = await Promise.all([
    Promise.all(
      selected.map((t) =>
        col(COLLECTIONS.assignments).where("teamId", "==", t.id).where("month", "in", months).get(),
      ),
    ),
    Promise.all(selected.map((t) => col(COLLECTIONS.agents).where("teamId", "==", t.id).get())),
  ]);
  const entries = entrySnaps
    .flatMap((s) => s.docs.map((d) => fromDoc<Assignment>(d)))
    .filter((e) => e.date >= range.from && e.date <= range.to);
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
  const rows = aggregateAgents(
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

  return { ...empty, rows, ...aggregateShifts(shifts, absences, entries) };
}
