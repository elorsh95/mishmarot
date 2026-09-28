import type { IsoDate } from "@/lib/dates";
import type { Shift, WorkLocation } from "@/modules/catalog/service";
import type { Assignment } from "./types";

/**
 * Seat occupancy: how many agents work from each location on the morning and on the evening of
 * each day (a double shift counts in both). Locations with a seat count (the office) are checked
 * against it, so the office neither overflows nor sits half empty while people work from home.
 */

export type Half = "morning" | "evening";

/** date → half → locationId → agents */
export type SeatUsage = Record<IsoDate, Record<Half, Record<string, number>>>;

export function seatUsage(
  entries: Array<Pick<Assignment, "date" | "kind" | "shiftId" | "locationId" | "quotaStatus">>,
  shifts: Array<Pick<Shift, "id" | "coversMorning" | "coversEvening">>,
): SeatUsage {
  const byId = new Map(shifts.map((s) => [s.id, s]));
  const out: SeatUsage = {};
  for (const e of entries) {
    if (e.kind !== "shift" || e.quotaStatus === "rejected" || !e.locationId) continue;
    const shift = e.shiftId ? byId.get(e.shiftId) : undefined;
    if (!shift) continue;
    const day = (out[e.date] ??= { morning: {}, evening: {} });
    if (shift.coversMorning) day.morning[e.locationId] = (day.morning[e.locationId] ?? 0) + 1;
    if (shift.coversEvening) day.evening[e.locationId] = (day.evening[e.locationId] ?? 0) + 1;
  }
  return out;
}

export interface SeatStatus {
  locationId: string;
  used: number;
  capacity: number;
  /** Agents over the seat count (0 when it fits). */
  over: number;
  /** Empty seats. */
  free: number;
}

/** The seat check for each location that has a seat count, on one half of one day. */
export function seatStatus(
  usage: SeatUsage,
  date: IsoDate,
  half: Half,
  locations: Array<Pick<WorkLocation, "id" | "capacity" | "isActive">>,
): SeatStatus[] {
  return locations
    .filter((l) => l.isActive && l.capacity)
    .map((l) => {
      const used = usage[date]?.[half][l.id] ?? 0;
      const capacity = l.capacity!;
      return {
        locationId: l.id,
        used,
        capacity,
        over: Math.max(0, used - capacity),
        free: Math.max(0, capacity - used),
      };
    });
}

/** Agents working from quota locations (home) on one half of one day. */
export function homeCount(
  usage: SeatUsage,
  date: IsoDate,
  half: Half,
  locations: Array<Pick<WorkLocation, "id" | "requiresQuota">>,
): number {
  return locations
    .filter((l) => l.requiresQuota)
    .reduce((n, l) => n + (usage[date]?.[half][l.id] ?? 0), 0);
}
