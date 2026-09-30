import { z } from "zod";
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
  formatDate,
  isClockTime,
  isIsoDate,
  nowClock,
  todayIso,
  weekStartOf,
  type IsoDate,
} from "@/lib/dates";
import { DomainError, NotFoundError } from "@/lib/errors";
import { agentName, type Agent } from "@/modules/agents/types";
import { auditInTx } from "@/modules/audit/service";
import { getDayInfos } from "@/modules/calendar/service";
import { shiftRunsOn } from "@/modules/calendar/types";
import {
  getCatalog,
  listAttendanceStatuses,
  type AttendanceStatus,
} from "@/modules/catalog/service";
import {
  assertCan,
  assertCanForTeam,
  canForTeam,
  teamScope,
  type Actor,
} from "@/modules/permissions/check";
import { assignmentId, weekId, type Assignment, type WeekSchedule } from "@/modules/schedule/types";
import { listActivities, teamsForActor } from "@/modules/teams/service";
import {
  currentShift,
  minutesOff,
  NOTE_MAX,
  type AttendanceDay,
  type AttendanceRecord,
  type AttendanceRow,
} from "./types";

/**
 * Attendance ("נוכחות"): the shift lead marks, against the day's schedule (published or draft),
 * who came, who was late or left early and where each agent actually works. The schedule
 * itself is never changed, so plan and actual can be compared later.
 */

export function attendanceId(agentId: string, date: IsoDate) {
  return `${agentId}_${date}`;
}

async function agentsByIds(ids: string[]): Promise<Map<string, Agent>> {
  const out = new Map<string, Agent>();
  const unique = [...new Set(ids)];
  for (const part of chunk(unique, 100)) {
    const snaps = await db().getAll(...part.map((id) => col(COLLECTIONS.agents).doc(id)));
    for (const s of snaps) if (s.exists) out.set(s.id, fromDoc<Agent>(s));
  }
  return out;
}

async function activeAgentsOf(teamIds: string[] | "all"): Promise<Agent[]> {
  if (teamIds === "all") {
    const snap = await col(COLLECTIONS.agents).where("isActive", "==", true).get();
    return snap.docs.map((d) => fromDoc<Agent>(d));
  }
  const parts = await Promise.all(
    chunk(teamIds).map((ids) => col(COLLECTIONS.agents).where("teamId", "in", ids).get()),
  );
  return parts.flatMap((p) => p.docs.map((d) => fromDoc<Agent>(d))).filter((a) => a.isActive);
}

export async function getAttendanceDay(actor: Actor, dateInput?: string): Promise<AttendanceDay> {
  assertCan(actor, "attendance.view");
  const today = todayIso();
  const date = dateInput && isIsoDate(dateInput) ? dateInput : today;
  const teams = await teamsForActor(actor, "attendance.view");
  const teamIds = new Set(teams.map((t) => t.id));
  const scope = teamScope(actor, "attendance.view");

  const [catalog, statuses, dayInfos, assignmentsSnap, recordsSnap, weekSnaps, active, activities] =
    await Promise.all([
      getCatalog(),
      listAttendanceStatuses(),
      getDayInfos([date]),
      col(COLLECTIONS.assignments).where("date", "==", date).get(),
      col(COLLECTIONS.attendance).where("date", "==", date).get(),
      teams.length
        ? db().getAll(
            ...teams.map((t) => col(COLLECTIONS.weeks).doc(weekId(t.id, weekStartOf(date)))),
          )
        : Promise.resolve([]),
      activeAgentsOf(scope === "all" ? "all" : [...teamIds]),
      listActivities(),
    ]);
  const dayInfo = dayInfos[date];

  const assignments = assignmentsSnap.docs
    .map((d) => fromDoc<Assignment>(d))
    .filter((a) => teamIds.has(a.teamId));
  const records = new Map(
    recordsSnap.docs
      .map((d) => fromDoc<AttendanceRecord>(d))
      .filter((r) => teamIds.has(r.teamId))
      .map((r) => [r.agentId, r]),
  );
  const agents = new Map(active.map((a) => [a.id, a]));
  const missing = [...assignments.map((a) => a.agentId), ...records.keys()].filter(
    (id) => !agents.has(id),
  );
  for (const [id, agent] of await agentsByIds(missing)) agents.set(id, agent);
  const nameOf = (id: string) => {
    const a = agents.get(id);
    return a ? agentName(a) : "נציג לא ידוע";
  };

  const rows: AttendanceRow[] = [];
  const absences: AttendanceDay["absences"] = [];
  const onList = new Set<string>();
  for (const a of assignments) {
    if (a.kind === "absence") {
      const type = catalog.absenceTypes.find((t) => t.id === a.absenceTypeId);
      absences.push({
        agentId: a.agentId,
        name: nameOf(a.agentId),
        teamId: a.teamId,
        absenceName: type?.name ?? "היעדרות",
      });
      continue;
    }
    // A home day that was rejected isn't on the schedule until it's changed.
    if (a.quotaStatus === "rejected") continue;
    onList.add(a.agentId);
    rows.push({
      agentId: a.agentId,
      name: nameOf(a.agentId),
      employeeNumber: agents.get(a.agentId)?.employeeNumber ?? "",
      teamId: a.teamId,
      shiftId: a.shiftId,
      plannedLocationId: a.locationId,
      note: a.note ?? "",
      record: records.get(a.agentId) ?? null,
      unscheduled: false,
      canManage: canForTeam(actor, "attendance.manage", a.teamId),
    });
  }
  for (const r of records.values()) {
    if (onList.has(r.agentId)) continue;
    onList.add(r.agentId);
    rows.push({
      agentId: r.agentId,
      name: nameOf(r.agentId),
      employeeNumber: agents.get(r.agentId)?.employeeNumber ?? "",
      teamId: r.teamId,
      shiftId: r.shiftId,
      plannedLocationId: null,
      note: "",
      record: r,
      unscheduled: true,
      canManage: canForTeam(actor, "attendance.manage", r.teamId),
    });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name, "he"));
  absences.sort((a, b) => a.name.localeCompare(b.name, "he"));

  const usedShiftIds = new Set(rows.map((r) => r.shiftId));
  const shifts = catalog.shifts
    .filter((s) => usedShiftIds.has(s.id) || (s.isActive && shiftRunsOn(s, date, dayInfo)))
    .map(({ id, name, color, startTime, endTime, coversMorning, coversEvening }) => ({
      id,
      name,
      color,
      startTime: startTime ?? null,
      endTime: endTime ?? null,
      coversMorning,
      coversEvening,
    }));
  const now = nowClock();
  const withRows = shifts.filter((s) => usedShiftIds.has(s.id));
  const current = date === today ? currentShift(withRows.length ? withRows : shifts, now) : null;

  const published = new Set(
    weekSnaps
      .filter((s) => s.exists)
      .map((s) => fromDoc<WeekSchedule>(s))
      .filter((w) => w.status === "published")
      .map((w) => w.teamId),
  );

  return {
    date,
    today,
    now,
    isFuture: date > today,
    shifts: shifts.map(({ id, name, color, startTime, endTime }) => ({
      id,
      name,
      color,
      startTime,
      endTime,
    })),
    currentShiftId: current?.id ?? withRows[0]?.id ?? shifts[0]?.id ?? null,
    // An inactive status still shows where it was already used.
    statuses: statuses.filter((s) => s.isActive || rows.some((r) => r.record?.statusId === s.id)),
    locations: catalog.locations
      .filter((l) => l.isActive)
      .map(({ id, name, color }) => ({ id, name, color })),
    teams: teams.map((t) => ({
      id: t.id,
      name: t.name,
      activityId: t.activityId,
      published: published.has(t.id),
      canManage: canForTeam(actor, "attendance.manage", t.id),
    })),
    activities,
    rows,
    absences,
    addable: active
      .filter((a) => !onList.has(a.id) && canForTeam(actor, "attendance.manage", a.teamId))
      .map((a) => ({ agentId: a.id, name: agentName(a), teamId: a.teamId }))
      .sort((a, b) => a.name.localeCompare(b.name, "he")),
    holidayName: dayInfo?.name ?? null,
  };
}

export const recordInputSchema = z.object({
  date: z.string().refine(isIsoDate, "תאריך לא תקין"),
  agentId: z.string().min(1),
  statusId: z.string().min(1, "יש לבחור סטטוס"),
  /** The actual location; null keeps the planned one. */
  locationId: z.string().min(1).nullable().default(null),
  time: z.string().refine(isClockTime, "שעה לא תקינה").nullable().default(null),
  note: z.string().trim().max(NOTE_MAX, `עד ${NOTE_MAX} תווים`).default(""),
  /** The shift, for an agent who isn't on the schedule this day. */
  shiftId: z.string().min(1).nullable().default(null),
});

export async function recordAttendance(actor: Actor, input: z.input<typeof recordInputSchema>) {
  const data = recordInputSchema.parse(input);
  if (data.date > todayIso()) throw new DomainError("לא ניתן לסמן נוכחות לתאריך עתידי");
  const [catalog, statuses] = await Promise.all([getCatalog(), listAttendanceStatuses()]);
  const ref = col(COLLECTIONS.attendance).doc(attendanceId(data.agentId, data.date));

  return db().runTransaction(async (tx) => {
    const [agentSnap, assignmentSnap, existingSnap] = await Promise.all([
      tx.get(col(COLLECTIONS.agents).doc(data.agentId)),
      tx.get(col(COLLECTIONS.assignments).doc(assignmentId(data.agentId, data.date))),
      tx.get(ref),
    ]);
    const agent = fromDocOrNull<Agent>(agentSnap);
    if (!agent) throw new NotFoundError("הנציג לא נמצא");
    const planned = fromDocOrNull<Assignment>(assignmentSnap);
    const existing = fromDocOrNull<AttendanceRecord>(existingSnap);
    const plannedShift =
      planned?.kind === "shift" && planned.quotaStatus !== "rejected" ? planned : null;
    const teamId = plannedShift?.teamId ?? existing?.teamId ?? agent.teamId;
    assertCanForTeam(actor, "attendance.manage", teamId);

    const status: AttendanceStatus | undefined = statuses.find((s) => s.id === data.statusId);
    if (!status || (!status.isActive && existing?.statusId !== status.id)) {
      throw new DomainError("סטטוס הנוכחות לא נמצא");
    }

    const shiftId = plannedShift?.shiftId ?? data.shiftId ?? existing?.shiftId ?? null;
    const shift = catalog.shifts.find((s) => s.id === shiftId);
    if (!plannedShift && !shift) throw new DomainError("יש לבחור משמרת לנציג שלא בסידור");

    let locationId: string | null = null;
    if (status.presence === "present") {
      locationId = data.locationId ?? existing?.locationId ?? plannedShift?.locationId ?? null;
      if (!locationId) throw new DomainError("יש לבחור מאיפה הנציג עובד");
      if (!catalog.locations.some((l) => l.id === locationId)) {
        throw new DomainError("מיקום העבודה לא נמצא");
      }
    }
    if (status.timeField !== "none" && !data.time) {
      throw new DomainError(
        status.timeField === "arrival" ? "יש להזין שעת הגעה" : "יש להזין שעת יציאה",
      );
    }
    const time = status.timeField === "none" ? null : data.time;

    const record = {
      agentId: agent.id,
      teamId,
      date: data.date,
      weekStart: weekStartOf(data.date),
      statusId: status.id,
      shiftId,
      locationId,
      time,
      minutesOff: minutesOff(shift, status.timeField, time),
      note: data.note,
      plannedShiftId: plannedShift?.shiftId ?? null,
      plannedLocationId: plannedShift?.locationId ?? null,
      unscheduled: !plannedShift,
      recordedBy: actor.id,
      recordedByName: actor.fullName,
    };
    tx.set(ref, { ...record, updatedAt: serverNow() });

    const location = catalog.locations.find((l) => l.id === locationId);
    const moved = locationId && plannedShift && locationId !== plannedShift.locationId;
    auditInTx(tx, actor, {
      action: existing ? "attendance.update" : "attendance.record",
      entityType: "attendance",
      entityId: ref.id,
      teamId,
      summary:
        `נוכחות ${agentName(agent)} ${formatDate(data.date)}: ${status.name}` +
        (time ? ` (${time})` : "") +
        (moved && location ? ` · עובד/ת מ${location.name}` : "") +
        (record.unscheduled ? " · לא היה/תה בסידור" : ""),
      before: existing,
      after: record,
    });
    return { id: ref.id };
  });
}

export async function clearAttendance(actor: Actor, date: string, agentId: string) {
  if (!isIsoDate(date)) throw new DomainError("תאריך לא תקין");
  const ref = col(COLLECTIONS.attendance).doc(attendanceId(agentId, date));
  await db().runTransaction(async (tx) => {
    const existing = fromDocOrNull<AttendanceRecord>(await tx.get(ref));
    if (!existing) return;
    assertCanForTeam(actor, "attendance.manage", existing.teamId);
    const agent = fromDocOrNull<Agent>(await tx.get(col(COLLECTIONS.agents).doc(agentId)));
    tx.delete(ref);
    auditInTx(tx, actor, {
      action: "attendance.clear",
      entityType: "attendance",
      entityId: ref.id,
      teamId: existing.teamId,
      summary: `בוטל סימון הנוכחות של ${agent ? agentName(agent) : "נציג"} ${formatDate(date)}`,
      before: existing,
    });
  });
}

/** Marks several agents at once with a status that asks for no time (e.g. "everyone left came"). */
export async function recordMany(
  actor: Actor,
  date: string,
  agentIds: string[],
  statusId: string,
): Promise<{ recorded: number; skipped: number }> {
  const ids = z.array(z.string().min(1)).max(300).parse(agentIds);
  let recorded = 0;
  for (const agentId of ids) {
    try {
      await recordAttendance(actor, { date, agentId, statusId });
      recorded += 1;
    } catch (err) {
      if (!(err instanceof DomainError)) throw err;
    }
  }
  return { recorded, skipped: ids.length - recorded };
}
