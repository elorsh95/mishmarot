import { clockMinutes, type ClockTime, type IsoDate } from "@/lib/dates";
import type { AttendanceStatus, Shift } from "@/modules/catalog/service";
import type { Activity } from "@/modules/teams/types";

/** What was marked for an agent on a day: `${agentId}_${date}`, one per agent per day. */
export interface AttendanceRecord {
  id: string;
  agentId: string;
  teamId: string;
  date: IsoDate;
  weekStart: IsoDate;
  statusId: string;
  /** The shift worked: the planned one, or the one chosen for an agent who wasn't scheduled. */
  shiftId: string | null;
  /** Where the agent actually works (null when absent). */
  locationId: string | null;
  /** Arrival or departure time, for statuses that ask for one. */
  time: ClockTime | null;
  /** Minutes late (arrival after the shift start) or early (departure before its end). */
  minutesOff: number | null;
  note: string;
  /** The plan, kept to compare against later. */
  plannedShiftId: string | null;
  plannedLocationId: string | null;
  /** The agent wasn't on the schedule for this day. */
  unscheduled: boolean;
  recordedBy: string;
  recordedByName: string;
  updatedAt: string | null;
}

/** One agent on the attendance screen: the plan, and what was marked (if anything). */
export interface AttendanceRow {
  agentId: string;
  name: string;
  employeeNumber: string;
  teamId: string;
  shiftId: string | null;
  plannedLocationId: string | null;
  note: string;
  record: AttendanceRecord | null;
  unscheduled: boolean;
  canManage: boolean;
}

export interface AttendanceDay {
  date: IsoDate;
  today: IsoDate;
  now: ClockTime;
  /** Days after today can't be marked yet. */
  isFuture: boolean;
  /** Shifts that run on this day, in display order. */
  shifts: Array<Pick<Shift, "id" | "name" | "color" | "startTime" | "endTime">>;
  /** The shift running now (today only), or the first one. */
  currentShiftId: string | null;
  statuses: AttendanceStatus[];
  locations: Array<{ id: string; name: string; color: string }>;
  teams: Array<{
    id: string;
    name: string;
    activityId: string | null;
    published: boolean;
    canManage: boolean;
  }>;
  /** For grouping and filtering the teams by activity. */
  activities: Activity[];
  rows: AttendanceRow[];
  /** Planned absences (vacation, sick…), for reference. */
  absences: Array<{ agentId: string; name: string; teamId: string; absenceName: string }>;
  /** Agents the actor can add who aren't on the list (not scheduled for this day). */
  addable: Array<{ agentId: string; name: string; teamId: string }>;
  holidayName: string | null;
}

export const NOTE_MAX = 200;

/** How many minutes off the shift's hours a time is (late arrival or early departure). */
export function minutesOff(
  shift: Pick<Shift, "startTime" | "endTime"> | undefined,
  timeField: AttendanceStatus["timeField"],
  time: ClockTime | null,
): number | null {
  if (!time || !shift) return null;
  if (timeField === "arrival" && shift.startTime) {
    return Math.max(0, clockMinutes(time) - clockMinutes(shift.startTime));
  }
  if (timeField === "departure" && shift.endTime) {
    return Math.max(0, clockMinutes(shift.endTime) - clockMinutes(time));
  }
  return null;
}

/**
 * The shift running at a time of day: the one whose hours contain it (the latest-starting one when
 * shifts overlap). Without hours, mornings until 14:00 and evenings after.
 */
export function currentShift<T extends Pick<Shift, "id" | "startTime" | "endTime">>(
  shifts: Array<T & Partial<Pick<Shift, "coversMorning" | "coversEvening">>>,
  now: ClockTime,
): T | null {
  if (shifts.length === 0) return null;
  const t = clockMinutes(now);
  const timed = shifts.filter((s) => s.startTime && s.endTime);
  const running = timed
    .filter((s) => {
      const start = clockMinutes(s.startTime!);
      const end = clockMinutes(s.endTime!);
      return start <= end ? t >= start && t < end : t >= start || t < end;
    })
    .sort((a, b) => clockMinutes(b.startTime!) - clockMinutes(a.startTime!));
  if (running.length > 0) return running[0];
  if (timed.length === 0) {
    const evening = t >= 14 * 60;
    const match = shifts.find((s) =>
      evening ? s.coversEvening && !s.coversMorning : s.coversMorning && !s.coversEvening,
    );
    if (match) return match;
  }
  return shifts[0];
}

export interface AttendanceSummary {
  planned: number;
  present: number;
  absent: number;
  late: number;
  unmarked: number;
}

/** Counts for a set of rows: marked present or absent, late arrivals, and not marked yet. */
export function summarizeAttendance(
  rows: Array<Pick<AttendanceRow, "record" | "unscheduled">>,
  statuses: Array<Pick<AttendanceStatus, "id" | "presence" | "timeField">>,
): AttendanceSummary {
  const byId = new Map(statuses.map((s) => [s.id, s]));
  const out: AttendanceSummary = { planned: 0, present: 0, absent: 0, late: 0, unmarked: 0 };
  for (const row of rows) {
    if (!row.unscheduled) out.planned += 1;
    const status = row.record ? byId.get(row.record.statusId) : undefined;
    if (!row.record) out.unmarked += 1;
    else if (status?.presence === "absent") out.absent += 1;
    else out.present += 1;
    if (status?.timeField === "arrival") out.late += 1;
  }
  return out;
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} דק׳`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}:${String(m).padStart(2, "0")} ש׳` : `${h} ש׳`;
}
