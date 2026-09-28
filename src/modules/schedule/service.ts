import { db } from "@/lib/firebase/admin";
import {
  chunk,
  col,
  COLLECTIONS,
  fromDoc,
  fromDocOrNull,
  serverNow,
} from "@/lib/firebase/collections";
import {
  addDays,
  formatWeekRange,
  MONTH_NAMES,
  todayIso,
  weekDates,
  weekdayOf,
  weekStartOf,
  type IsoDate,
} from "@/lib/dates";
import { DomainError, NotFoundError } from "@/lib/errors";
import { emit } from "@/lib/events";
import { agentName, type Agent } from "@/modules/agents/types";
import { auditInTx } from "@/modules/audit/service";
import { getDayInfos } from "@/modules/calendar/service";
import { shiftRunsOn, type DayInfo } from "@/modules/calendar/types";
import { getCatalog } from "@/modules/catalog/service";
import {
  assertCan,
  assertCanForTeam,
  canForTeam,
  teamScope,
  type Actor,
} from "@/modules/permissions/check";
import { getSettings } from "@/modules/settings/service";
import { getTeam, type Team } from "@/modules/teams/service";
import { applyChanges, noChanges, type ApplyResult } from "./engine";
import { countUsedQuotaDays, quotaPeriodField, quotaPeriodKey } from "./quota";
import { isPastWeek } from "./rules";
import { seatUsage, type SeatUsage } from "./seats";
import {
  assignmentId,
  weekId,
  type Assignment,
  type ChangeOp,
  type EntryInput,
  type QuotaPeriod,
  type WeekSchedule,
  type WeekStatus,
} from "./types";

export interface QuotaUsage {
  /** The quota period: a week start (Sunday) or a month (YYYY-MM). */
  key: string;
  period: QuotaPeriod;
  /** Short label for the period, e.g. "השבוע" or "ספטמבר". */
  label: string;
  used: number;
  quota: number;
}

export interface WeekView {
  team: Team;
  weekStart: IsoDate;
  label: string;
  days: IsoDate[];
  /** Holidays and special days: how each day of the week is worked. */
  dayInfo: Record<IsoDate, DayInfo>;
  today: IsoDate;
  agents: Array<Agent & { inTeam: boolean }>;
  assignments: Record<string, Assignment>;
  week: WeekSchedule;
  quotaUsage: Record<string, QuotaUsage[]>;
  quotaPeriod: QuotaPeriod;
  /** Decision details for entries that went through approval, keyed by approval id. */
  approvals: Record<string, ApprovalInfo>;
  isPast: boolean;
  canEdit: boolean;
  canPublish: boolean;
  canEditLocked: boolean;
  /** Why editing is blocked for this actor, if it is. */
  lockReason: string | null;
}

export interface ApprovalInfo {
  status: string;
  position: number;
  quota: number;
  decidedByName: string | null;
  decisionNote: string;
}

export async function getWeek(teamId: string, weekStart: IsoDate): Promise<WeekSchedule> {
  const snap = await col(COLLECTIONS.weeks).doc(weekId(teamId, weekStart)).get();
  return (
    fromDocOrNull<WeekSchedule>(snap) ?? {
      id: weekId(teamId, weekStart),
      teamId,
      weekStart,
      status: "draft",
      publishedBy: null,
      publishedByName: null,
      publishedAt: null,
    }
  );
}

export async function getWeekView(
  actor: Actor,
  teamId: string,
  weekStartInput: IsoDate,
): Promise<WeekView> {
  assertCanForTeam(actor, "schedule.view", teamId);
  const weekStart = weekStartOf(weekStartInput);
  const team = await getTeam(teamId);
  if (!team) throw new NotFoundError("הצוות לא נמצא");
  const today = todayIso();
  const [catalog, settings, week, agentsSnap, assignmentsSnap] = await Promise.all([
    getCatalog(),
    getSettings(),
    getWeek(teamId, weekStart),
    col(COLLECTIONS.agents).where("teamId", "==", teamId).get(),
    col(COLLECTIONS.assignments)
      .where("teamId", "==", teamId)
      .where("weekStart", "==", weekStart)
      .get(),
  ]);

  const assignments: Record<string, Assignment> = {};
  for (const d of assignmentsSnap.docs) assignments[d.id] = fromDoc<Assignment>(d);

  const teamAgents = agentsSnap.docs.map((d) => fromDoc<Agent>(d));
  const withEntries = new Set(Object.values(assignments).map((a) => a.agentId));
  // Agents who left the team but still have entries in this week are shown too.
  const missing = [...withEntries].filter((id) => !teamAgents.some((a) => a.id === id));
  const formerAgents = missing.length
    ? (await db().getAll(...missing.map((id) => col(COLLECTIONS.agents).doc(id))))
        .filter((s) => s.exists)
        .map((s) => fromDoc<Agent>(s))
    : [];

  const agents = [
    ...teamAgents
      .filter((a) => a.isActive || withEntries.has(a.id))
      .map((a) => ({ ...a, inTeam: true })),
    ...formerAgents.map((a) => ({ ...a, inTeam: false })),
  ].sort(
    (a, b) =>
      Number(b.inTeam) - Number(a.inTeam) ||
      Number(b.isActive) - Number(a.isActive) ||
      agentName(a).localeCompare(agentName(b), "he"),
  );

  // Saturday is shown only if some active shift runs on it.
  const hasSaturday = catalog.shifts.some((s) => s.isActive && s.daysOfWeek.includes(6));
  const days = weekDates(weekStart).filter((d) => hasSaturday || weekdayOf(d) !== 6);

  const dayInfo = await getDayInfos(days);

  // Quota usage for the quota periods this week touches: the week itself, or its month(s).
  const period = settings.quotaPeriod;
  const periodKeys = [...new Set(days.map((d) => quotaPeriodKey(d, period)))];
  const quotaLocations = new Set(catalog.locations.filter((l) => l.requiresQuota).map((l) => l.id));
  const periodSnaps = await Promise.all(
    periodKeys.map((k) =>
      col(COLLECTIONS.assignments)
        .where("teamId", "==", teamId)
        .where(quotaPeriodField(period), "==", k)
        .get(),
    ),
  );
  const quotaUsage: Record<string, QuotaUsage[]> = {};
  for (const agent of agents) {
    quotaUsage[agent.id] = periodKeys.map((key, i) => {
      const entries = periodSnaps[i].docs
        .map((d) => fromDoc<Assignment>(d))
        .filter((a) => a.agentId === agent.id);
      return {
        key,
        period,
        label: period === "week" ? "השבוע" : MONTH_NAMES[Number(key.slice(5)) - 1],
        used: countUsedQuotaDays(entries, quotaLocations),
        quota: agent.monthlyQuota ?? settings.defaultMonthlyQuota,
      };
    });
  }

  const approvalIds = [
    ...new Set(Object.values(assignments).flatMap((a) => (a.approvalId ? [a.approvalId] : []))),
  ];
  const approvals: Record<string, ApprovalInfo> = {};
  if (approvalIds.length > 0) {
    const snaps = await db().getAll(...approvalIds.map((id) => col(COLLECTIONS.approvals).doc(id)));
    for (const s of snaps.filter((x) => x.exists)) {
      approvals[s.id] = {
        status: String(s.get("status")),
        position: Number(s.get("position") ?? 0),
        quota: Number(s.get("quota") ?? 0),
        decidedByName: (s.get("decidedByName") as string | null) ?? null,
        decisionNote: String(s.get("decisionNote") ?? ""),
      };
    }
  }

  const isPast = isPastWeek(weekStart, today);
  const canEdit = canForTeam(actor, "schedule.edit", teamId);
  const canEditLocked = canForTeam(actor, "schedule.editLocked", teamId);
  let lockReason: string | null = null;
  if (!canEdit) lockReason = "צפייה בלבד";
  else if (isPast && !canEditLocked) lockReason = "שבוע שעבר נעול לעריכה";
  else if (week.status === "published" && !canEditLocked) {
    lockReason = "הסידור פורסם. כדי לערוך יש להחזיר אותו לטיוטה";
  }

  return {
    team,
    weekStart,
    label: formatWeekRange(weekStart),
    days,
    dayInfo,
    today,
    agents,
    assignments,
    week,
    quotaUsage,
    quotaPeriod: period,
    approvals,
    isPast,
    canEdit,
    canPublish: canForTeam(actor, "schedule.publish", teamId),
    canEditLocked,
    lockReason,
  };
}

export async function setDayEntry(
  actor: Actor,
  agentId: string,
  date: IsoDate,
  entry: EntryInput | null,
): Promise<ApplyResult> {
  return applyChanges(actor, [{ agentId, date, entry }], { mode: "strict" });
}

export async function setWeekStatus(
  actor: Actor,
  teamId: string,
  weekStartInput: IsoDate,
  status: WeekStatus,
) {
  assertCanForTeam(actor, "schedule.publish", teamId);
  const weekStart = weekStartOf(weekStartInput);
  if (isPastWeek(weekStart, todayIso()) && !canForTeam(actor, "schedule.editLocked", teamId)) {
    throw new DomainError("שבוע שעבר נעול לשינויים");
  }
  const team = await getTeam(teamId);
  if (!team) throw new NotFoundError("הצוות לא נמצא");
  const ref = col(COLLECTIONS.weeks).doc(weekId(teamId, weekStart));
  await db().runTransaction(async (tx) => {
    const before = (await tx.get(ref)).get("status") ?? "draft";
    if (before === status) return;
    tx.set(
      ref,
      {
        teamId,
        weekStart,
        status,
        publishedBy: status === "published" ? actor.id : null,
        publishedByName: status === "published" ? actor.fullName : null,
        publishedAt: status === "published" ? serverNow() : null,
        updatedAt: serverNow(),
      },
      { merge: true },
    );
    auditInTx(tx, actor, {
      action: status === "published" ? "week.publish" : "week.unpublish",
      entityType: "week",
      entityId: weekId(teamId, weekStart),
      teamId,
      summary:
        status === "published"
          ? `פורסם הסידור של צוות ${team.name} לשבוע ${formatWeekRange(weekStart)}`
          : `הסידור של צוות ${team.name} לשבוע ${formatWeekRange(weekStart)} הוחזר לטיוטה`,
      before: { status: before },
      after: { status },
    });
  });
  if (status === "published") emit("week.published", { teamId, weekStart });
}

async function existingWeekIds(teamId: string, weekStart: IsoDate) {
  const snap = await col(COLLECTIONS.assignments)
    .where("teamId", "==", teamId)
    .where("weekStart", "==", weekStart)
    .get();
  return new Set(snap.docs.map((d) => d.id));
}

/** Copies shift entries (not absences) from the previous week into empty, workable days. */
export async function copyPreviousWeek(actor: Actor, teamId: string, weekStartInput: IsoDate) {
  assertCanForTeam(actor, "schedule.edit", teamId);
  const weekStart = weekStartOf(weekStartInput);
  const prevStart = addDays(weekStart, -7);
  const [prevSnap, existing, agentsSnap, catalog, dayInfo] = await Promise.all([
    col(COLLECTIONS.assignments)
      .where("teamId", "==", teamId)
      .where("weekStart", "==", prevStart)
      .get(),
    existingWeekIds(teamId, weekStart),
    col(COLLECTIONS.agents).where("teamId", "==", teamId).where("isActive", "==", true).get(),
    getCatalog(),
    getDayInfos(weekDates(weekStart)),
  ]);
  const activeAgents = new Set(agentsSnap.docs.map((d) => d.id));
  const ops: ChangeOp[] = [];
  for (const doc of prevSnap.docs) {
    const prev = fromDoc<Assignment>(doc);
    if (prev.kind !== "shift" || !prev.shiftId || !prev.locationId) continue;
    if (!activeAgents.has(prev.agentId)) continue;
    const date = addDays(prev.date, 7);
    if (existing.has(assignmentId(prev.agentId, date))) continue;
    // Holidays and eves this week are skipped quietly rather than reported as errors.
    const shift = catalog.shifts.find((sh) => sh.id === prev.shiftId);
    if (shift && !shiftRunsOn(shift, date, dayInfo[date])) continue;
    ops.push({
      agentId: prev.agentId,
      date,
      entry: { kind: "shift", shiftId: prev.shiftId, locationId: prev.locationId, note: prev.note },
    });
  }
  if (ops.length === 0) return noChanges();
  return applyChanges(actor, ops, { mode: "bulk" });
}

/** Fills empty days from each agent's default shift, location and working days. */
export async function fillFromDefaults(actor: Actor, teamId: string, weekStartInput: IsoDate) {
  assertCanForTeam(actor, "schedule.edit", teamId);
  const weekStart = weekStartOf(weekStartInput);
  const [catalog, existing, agentsSnap, dayInfo] = await Promise.all([
    getCatalog(),
    existingWeekIds(teamId, weekStart),
    col(COLLECTIONS.agents).where("teamId", "==", teamId).where("isActive", "==", true).get(),
    getDayInfos(weekDates(weekStart)),
  ]);
  const fallbackLocation = catalog.locations.find((l) => l.isActive && !l.requiresQuota);
  const ops: ChangeOp[] = [];
  for (const agent of agentsSnap.docs.map((d) => fromDoc<Agent>(d))) {
    const shift = catalog.shifts.find((s) => s.id === agent.defaultShiftId && s.isActive);
    const locationId = agent.defaultLocationId ?? fallbackLocation?.id;
    if (!shift || !locationId) continue;
    for (const date of weekDates(weekStart)) {
      // On a holiday eve the day's usual shift may not run (e.g. evening); it is left empty.
      if (
        !(agent.defaultDays ?? []).includes(weekdayOf(date)) ||
        !shiftRunsOn(shift, date, dayInfo[date])
      ) {
        continue;
      }
      if (existing.has(assignmentId(agent.id, date))) continue;
      ops.push({
        agentId: agent.id,
        date,
        entry: { kind: "shift", shiftId: shift.id, locationId },
      });
    }
  }
  if (ops.length === 0) return noChanges();
  return applyChanges(actor, ops, { mode: "bulk" });
}

/** Longest absence range that can be entered at once. */
export const MAX_RANGE_DAYS = 62;
/** Most cells a single bulk edit may touch. */
export const MAX_BULK_CELLS = 600;

/**
 * Records one absence (e.g. a vacation) for every day in a date range.
 * Saturdays are skipped unless some shift runs on them, holidays (closed days) are skipped, and with
 * workDaysOnly only the agent's usual working days are filled. Existing entries on those days are
 * replaced; locked or published weeks are reported as skipped, like any bulk change.
 */
export async function setAbsenceRange(
  actor: Actor,
  agentId: string,
  from: IsoDate,
  to: IsoDate,
  entry: Extract<EntryInput, { kind: "absence" }>,
  { workDaysOnly }: { workDaysOnly: boolean },
): Promise<ApplyResult> {
  if (to < from) throw new DomainError("תאריך הסיום מוקדם מתאריך ההתחלה");
  const dates: IsoDate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    dates.push(d);
    if (dates.length > MAX_RANGE_DAYS) {
      throw new DomainError(`אפשר להזין עד ${MAX_RANGE_DAYS} ימים בפעולה אחת`);
    }
  }
  const [agentSnap, catalog, dayInfo] = await Promise.all([
    col(COLLECTIONS.agents).doc(agentId).get(),
    getCatalog(),
    getDayInfos(dates),
  ]);
  if (!agentSnap.exists) throw new NotFoundError("הנציג לא נמצא");
  const agent = fromDoc<Agent>(agentSnap);
  assertCanForTeam(actor, "schedule.edit", agent.teamId);
  const hasSaturday = catalog.shifts.some((s) => s.isActive && s.daysOfWeek.includes(6));
  const ops: ChangeOp[] = dates
    .filter((d) => dayInfo[d]?.kind !== "closed")
    .filter((d) => hasSaturday || weekdayOf(d) !== 6)
    .filter((d) => !workDaysOnly || (agent.defaultDays ?? []).includes(weekdayOf(d)))
    .map((date) => ({ agentId, date, entry }));
  if (ops.length === 0) return noChanges();
  return applyChanges(actor, ops, { mode: "bulk" });
}

/** Sets the same entry (or clears, with null) on many agent-days at once. */
export async function setEntries(
  actor: Actor,
  cells: Array<{ agentId: string; date: IsoDate }>,
  entry: EntryInput | null,
): Promise<ApplyResult> {
  if (cells.length === 0) return noChanges();
  if (cells.length > MAX_BULK_CELLS) {
    throw new DomainError(`אפשר לעדכן עד ${MAX_BULK_CELLS} משבצות בפעולה אחת`);
  }
  // Permissions, locks and day rules are checked per cell by the engine.
  return applyChanges(
    actor,
    cells.map((c) => ({ ...c, entry })),
    { mode: "bulk" },
  );
}

/** Clears every entry of the team's week (editable days only). */
export async function clearWeek(actor: Actor, teamId: string, weekStartInput: IsoDate) {
  assertCanForTeam(actor, "schedule.edit", teamId);
  const weekStart = weekStartOf(weekStartInput);
  const snap = await col(COLLECTIONS.assignments)
    .where("teamId", "==", teamId)
    .where("weekStart", "==", weekStart)
    .get();
  const ops: ChangeOp[] = snap.docs.map((d) => ({
    agentId: String(d.get("agentId")),
    date: String(d.get("date")),
    entry: null,
  }));
  if (ops.length === 0) return noChanges();
  return applyChanges(actor, ops, { mode: "bulk" });
}

/** Upcoming entries rejected by the center manager, in the teams the actor edits. */
export async function listUpcomingRejected(
  actor: Actor,
  today: IsoDate,
): Promise<Array<{ entry: Assignment; agent: Agent | undefined }>> {
  const scope = teamScope(actor, "schedule.edit");
  if (scope !== "all" && scope.length === 0) return [];
  const base = col(COLLECTIONS.assignments)
    .where("quotaStatus", "==", "rejected")
    .where("date", ">=", today);
  const queries =
    scope === "all" ? [base] : chunk(scope).map((ids) => base.where("teamId", "in", ids));
  const snaps = await Promise.all(queries.map((q) => q.orderBy("date").limit(50).get()));
  const entries = snaps.flatMap((s) => s.docs.map((d) => fromDoc<Assignment>(d)));
  if (entries.length === 0) return [];
  const agentIds = [...new Set(entries.map((e) => e.agentId))];
  const agentSnaps = await db().getAll(...agentIds.map((id) => col(COLLECTIONS.agents).doc(id)));
  const agents = new Map(agentSnaps.filter((d) => d.exists).map((d) => [d.id, fromDoc<Agent>(d)]));
  return entries
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((entry) => ({ entry, agent: agents.get(entry.agentId) }));
}

/**
 * Seats taken at each location across the whole center this week, for the occupancy check.
 * Counts only (no names), so anyone who can view some schedule may see them.
 */
export async function getWeekSeatUsage(actor: Actor, weekStartInput: IsoDate): Promise<SeatUsage> {
  assertCan(actor, "schedule.view");
  const weekStart = weekStartOf(weekStartInput);
  const [catalog, snap] = await Promise.all([
    getCatalog(),
    col(COLLECTIONS.assignments).where("weekStart", "==", weekStart).get(),
  ]);
  return seatUsage(
    snap.docs.map((d) => fromDoc<Assignment>(d)),
    catalog.shifts,
  );
}
