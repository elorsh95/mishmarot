import { weekdayOf, type IsoDate } from "@/lib/dates";

/**
 * How the call center works on a date:
 * - regular: a normal day (it may still carry a label, e.g. Chanukah or Chol HaMoed)
 * - eve: a holiday eve, worked like a Friday (only shifts that run on Friday)
 * - closed: a holiday, the center is closed and nothing can be scheduled
 */
export type DayKind = "regular" | "eve" | "closed";

export interface DayInfo {
  kind: DayKind;
  /** Holiday name, e.g. "ערב פסח". null for an ordinary day. */
  name: string | null;
  /** calendar: the built-in Israeli calendar; custom: set by an admin/center manager. */
  source: "calendar" | "custom";
}

export const DAY_KIND_LABELS: Record<DayKind, string> = {
  regular: "יום רגיל",
  eve: "ערב חג (כמו שישי)",
  closed: "חג (המוקד סגור)",
};

export const REGULAR_DAY: DayInfo = { kind: "regular", name: null, source: "calendar" };

/**
 * The weekday whose shift rules apply on a date: a holiday eve follows Friday's shifts.
 * null when the center is closed.
 */
export function shiftWeekday(date: IsoDate, day: DayInfo | undefined): number | null {
  if (day?.kind === "closed") return null;
  if (day?.kind === "eve") return 5;
  return weekdayOf(date);
}

export function shiftRunsOn(
  shift: { daysOfWeek: number[] },
  date: IsoDate,
  day: DayInfo | undefined,
): boolean {
  const weekday = shiftWeekday(date, day);
  return weekday !== null && shift.daysOfWeek.includes(weekday);
}

/** An admin's change to how a date is worked, overriding the built-in calendar. */
export interface SpecialDay {
  id: IsoDate;
  date: IsoDate;
  kind: DayKind;
  name: string;
  updatedByName: string;
}
