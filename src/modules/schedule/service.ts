import { db } from "@/lib/firebase/admin";
import { col, COLLECTIONS, fromDoc, fromDocOrNull, serverNow } from "@/lib/firebase/collections";
import {
  addDays,
  formatWeekRange,
  monthOf,
  todayIso,
  weekDates,
  weekdayOf,
  weekStartOf,
  type IsoDate,
  type IsoMonth,
} from "@/lib/dates";
import { DomainError, NotFoundError } from "@/lib/errors";
import { emit } from "@/lib/events";
import { agentName, type Agent } from "@/modules/agents/types";
import { auditInTx } from "@/modules/audit/service";
import { getCatalog } from "@/modules/catalog/service";
import { assertCanForTeam, canForTeam, type Actor } from "@/modules/permissions/check";
import { getSettings } from "@/modules/settings/service";
import { getTeam, type Team } from "@/modules/teams/service";
import { applyChanges, type ApplyResult } from "./engine";
import { countUsedQuotaDays } from "./quota";
import { isPastWeek } from "./rules";
import {
  assignmentId,
  weekId,
  type Assignment,
  type ChangeOp,
  type EntryInput,
  type WeekSchedule,
  type WeekStatus,
} from "./types";

export interface QuotaUsage {
  month: IsoMonth;
  used: number;
  quota: number;
}

export interface WeekView {
  team: Team;
  weekStart: IsoDate;
  label: string;
  days: IsoDate[];
  today: IsoDate;
  agents: Array<Agent & { inTeam: boolean }>;
  assignments: Record<string, Assignment>;
  week: WeekSchedule;
  quotaUsage: Record<string, QuotaUsage[]>;
  isPast: boolean;
  canEdit: boolean;
  canPublish: boolean;
  canEditLocked: boolean;
  /** Why editing is blocked for this actor, if it is. */
  lockReason: string | null;
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

  // Monthly quota usage for the months this week touches.
  const months = [...new Set(days.map(monthOf))];
  const quotaLocations = new Set(catalog.locations.filter((l) => l.requiresQuota).map((l) => l.id));
  const monthSnaps = await Promise.all(
    months.map((m) =>
      col(COLLECTIONS.assignments).where("teamId", "==", teamId).where("month", "==", m).get(),
    ),
  );
  const quotaUsage: Record<string, QuotaUsage[]> = {};
  for (const agent of agents) {
    quotaUsage[agent.id] = months.map((month, i) => {
      const entries = monthSnaps[i].docs
        .map((d) => fromDoc<Assignment>(d))
        .filter((a) => a.agentId === agent.id);
      return {
        month,
        used: countUsedQuotaDays(entries, quotaLocations),
        quota: agent.monthlyQuota ?? settings.defaultMonthlyQuota,
      };
    });
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
    today,
    agents,
    assignments,
    week,
    quotaUsage,
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

/** Copies shift entries (not absences) from the previous week into empty days. */
export async function copyPreviousWeek(actor: Actor, teamId: string, weekStartInput: IsoDate) {
  assertCanForTeam(actor, "schedule.edit", teamId);
  const weekStart = weekStartOf(weekStartInput);
  const prevStart = addDays(weekStart, -7);
  const [prevSnap, existing, agentsSnap] = await Promise.all([
    col(COLLECTIONS.assignments)
      .where("teamId", "==", teamId)
      .where("weekStart", "==", prevStart)
      .get(),
    existingWeekIds(teamId, weekStart),
    col(COLLECTIONS.agents).where("teamId", "==", teamId).where("isActive", "==", true).get(),
  ]);
  const activeAgents = new Set(agentsSnap.docs.map((d) => d.id));
  const ops: ChangeOp[] = [];
  for (const doc of prevSnap.docs) {
    const prev = fromDoc<Assignment>(doc);
    if (prev.kind !== "shift" || !prev.shiftId || !prev.locationId) continue;
    if (!activeAgents.has(prev.agentId)) continue;
    const date = addDays(prev.date, 7);
    if (existing.has(assignmentId(prev.agentId, date))) continue;
    ops.push({
      agentId: prev.agentId,
      date,
      entry: { kind: "shift", shiftId: prev.shiftId, locationId: prev.locationId, note: prev.note },
    });
  }
  if (ops.length === 0) return { changed: 0, skipped: [], pendingApprovalIds: [] };
  return applyChanges(actor, ops, { mode: "bulk" });
}

/** Fills empty days from each agent's default shift, location and working days. */
export async function fillFromDefaults(actor: Actor, teamId: string, weekStartInput: IsoDate) {
  assertCanForTeam(actor, "schedule.edit", teamId);
  const weekStart = weekStartOf(weekStartInput);
  const [catalog, existing, agentsSnap] = await Promise.all([
    getCatalog(),
    existingWeekIds(teamId, weekStart),
    col(COLLECTIONS.agents).where("teamId", "==", teamId).where("isActive", "==", true).get(),
  ]);
  const fallbackLocation = catalog.locations.find((l) => l.isActive && !l.requiresQuota);
  const ops: ChangeOp[] = [];
  for (const agent of agentsSnap.docs.map((d) => fromDoc<Agent>(d))) {
    const shift = catalog.shifts.find((s) => s.id === agent.defaultShiftId && s.isActive);
    const locationId = agent.defaultLocationId ?? fallbackLocation?.id;
    if (!shift || !locationId) continue;
    for (const date of weekDates(weekStart)) {
      const weekday = weekdayOf(date);
      if (!(agent.defaultDays ?? []).includes(weekday) || !shift.daysOfWeek.includes(weekday)) {
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
  if (ops.length === 0) return { changed: 0, skipped: [], pendingApprovalIds: [] };
  return applyChanges(actor, ops, { mode: "bulk" });
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
  if (ops.length === 0) return { changed: 0, skipped: [], pendingApprovalIds: [] };
  return applyChanges(actor, ops, { mode: "bulk" });
}
