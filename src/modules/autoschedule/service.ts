import { z } from "zod";
import { col, COLLECTIONS, fromDoc } from "@/lib/firebase/collections";
import { addDays, isIsoDate, weekStartOf, type IsoDate } from "@/lib/dates";
import { DomainError } from "@/lib/errors";
import { agentName } from "@/modules/agents/types";
import { getDayInfos } from "@/modules/calendar/service";
import { shiftWeekday } from "@/modules/calendar/types";
import { getCatalog } from "@/modules/catalog/service";
import { assertCanForTeam, type Actor } from "@/modules/permissions/check";
import { applyChanges, noChanges, type ApplyResult } from "@/modules/schedule/engine";
import { quotaPeriodKey } from "@/modules/schedule/quota";
import { getWeekView } from "@/modules/schedule/service";
import { assignmentId, type Assignment, type ChangeOp } from "@/modules/schedule/types";
import { solveWeek } from "./solver";
import { FAIRNESS_WEEKS, type AutoScheduleOptions, type Proposal } from "./types";

/**
 * "הצע סידור": proposes how to fill a team's week (see solver.ts), for the manager to review,
 * then applies it through applyChanges like any bulk edit (locks, quota, audit, undo).
 */
export async function proposeWeek(
  actor: Actor,
  teamId: string,
  weekStartInput: IsoDate,
  options: AutoScheduleOptions,
): Promise<Proposal> {
  assertCanForTeam(actor, "schedule.edit", teamId);
  const weekStart = weekStartOf(weekStartInput);
  const [view, catalog] = await Promise.all([getWeekView(actor, teamId, weekStart), getCatalog()]);
  if (view.lockReason) throw new DomainError(view.lockReason);

  // Fairness: evenings and Fridays each agent worked in the look-back weeks.
  const pastWeeks = Array.from({ length: FAIRNESS_WEEKS }, (_, i) =>
    addDays(weekStart, -7 * (i + 1)),
  );
  const [pastSnap, pastDayInfo] = await Promise.all([
    col(COLLECTIONS.assignments)
      .where("teamId", "==", teamId)
      .where("weekStart", "in", pastWeeks)
      .get(),
    getDayInfos(pastWeeks.flatMap((w) => Array.from({ length: 7 }, (_, i) => addDays(w, i)))),
  ]);
  const shiftById = new Map(catalog.shifts.map((s) => [s.id, s]));
  const history: Record<string, { evenings: number; fridays: number }> = {};
  for (const doc of pastSnap.docs) {
    const e = fromDoc<Assignment>(doc);
    const shift = e.shiftId ? shiftById.get(e.shiftId) : undefined;
    if (e.kind !== "shift" || !shift || e.quotaStatus === "rejected") continue;
    const h = (history[e.agentId] ??= { evenings: 0, fridays: 0 });
    if (shift.coversEvening) h.evenings += 1;
    if (shiftWeekday(e.date, pastDayInfo[e.date]) === 5) h.fridays += 1;
  }

  const agents = view.agents.filter((a) => a.isActive && a.inTeam);
  const quotaLeft: Record<string, Record<string, number>> = {};
  for (const a of agents) {
    quotaLeft[a.id] = Object.fromEntries(
      (view.quotaUsage[a.id] ?? []).map((u) => [u.key, Math.max(0, u.quota - u.used)]),
    );
  }

  const result = solveWeek({
    days: view.days,
    dayInfo: view.dayInfo,
    shifts: catalog.shifts,
    locations: catalog.locations,
    agents: agents.map((a) => ({
      id: a.id,
      name: agentName(a),
      defaultShiftId: a.defaultShiftId,
      defaultLocationId: a.defaultLocationId,
      defaultDays: a.defaultDays ?? [],
    })),
    existing: Object.values(view.assignments).map((e) => ({
      agentId: e.agentId,
      date: e.date,
      kind: e.kind,
      shiftId: e.shiftId,
      quotaStatus: e.quotaStatus,
    })),
    min: { morning: view.team.minMorning, evening: view.team.minEvening },
    quotaLeft,
    periodKeyOf: (d) => quotaPeriodKey(d, view.quotaPeriod),
    history,
    options,
  });
  return { teamId, weekStart, ...result, historyWeeks: FAIRNESS_WEEKS };
}

export const proposalEntriesSchema = z
  .array(
    z.object({
      agentId: z.string().min(1),
      date: z.string().refine(isIsoDate),
      shiftId: z.string().min(1),
      locationId: z.string().min(1),
    }),
  )
  .max(600, "ההצעה גדולה מדי");

/**
 * Applies a reviewed proposal. Only cells that are still empty are filled (someone may have
 * edited the week since), and only for agents of this team in this week.
 */
export async function applyProposal(
  actor: Actor,
  teamId: string,
  weekStartInput: IsoDate,
  input: z.input<typeof proposalEntriesSchema>,
): Promise<ApplyResult> {
  assertCanForTeam(actor, "schedule.edit", teamId);
  const entries = proposalEntriesSchema.parse(input);
  const weekStart = weekStartOf(weekStartInput);
  const [existingSnap, agentsSnap] = await Promise.all([
    col(COLLECTIONS.assignments)
      .where("teamId", "==", teamId)
      .where("weekStart", "==", weekStart)
      .get(),
    col(COLLECTIONS.agents).where("teamId", "==", teamId).where("isActive", "==", true).get(),
  ]);
  const filled = new Set(existingSnap.docs.map((d) => d.id));
  const teamAgents = new Set(agentsSnap.docs.map((d) => d.id));
  const ops: ChangeOp[] = entries
    .filter(
      (e) =>
        teamAgents.has(e.agentId) &&
        weekStartOf(e.date) === weekStart &&
        !filled.has(assignmentId(e.agentId, e.date)),
    )
    .map((e) => ({
      agentId: e.agentId,
      date: e.date,
      entry: { kind: "shift", shiftId: e.shiftId, locationId: e.locationId },
    }));
  if (ops.length === 0) return noChanges();
  return applyChanges(actor, ops, { mode: "bulk" });
}
