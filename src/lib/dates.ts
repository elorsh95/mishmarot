/**
 * Calendar helpers. Dates are plain "YYYY-MM-DD" strings (IsoDate) everywhere in the domain,
 * so there are no timezone surprises. "Today" is computed in Israel time.
 */

export type IsoDate = string; // YYYY-MM-DD
export type IsoMonth = string; // YYYY-MM

export const APP_TIMEZONE = "Asia/Jerusalem";

export const WEEKDAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"] as const;
export const WEEKDAY_SHORT = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"] as const;
export const MONTH_NAMES = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
] as const;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  return toIsoDate(parseIsoDate(value)) === value;
}

/** Parses as a UTC midnight Date, used only for arithmetic. */
export function parseIsoDate(value: IsoDate): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toIsoDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

export function todayIso(now: Date = new Date()): IsoDate {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = parseIsoDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoDate(d);
}

/** 0 = Sunday … 6 = Saturday */
export function weekdayOf(date: IsoDate): number {
  return parseIsoDate(date).getUTCDay();
}

/** Weeks start on Sunday. */
export function weekStartOf(date: IsoDate): IsoDate {
  return addDays(date, -weekdayOf(date));
}

export function weekDates(weekStart: IsoDate): IsoDate[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function monthOf(date: IsoDate): IsoMonth {
  return date.slice(0, 7);
}

export function monthRange(month: IsoMonth): { from: IsoDate; to: IsoDate } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

export function addMonths(month: IsoMonth, delta: number): IsoMonth {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return toIsoDate(d).slice(0, 7);
}

export function formatDayMonth(date: IsoDate): string {
  const [, m, d] = date.split("-");
  return `${Number(d)}.${Number(m)}`;
}

export function formatDate(date: IsoDate): string {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

export function formatDateWithDay(date: IsoDate): string {
  return `יום ${WEEKDAY_NAMES[weekdayOf(date)]} ${formatDate(date)}`;
}

export function formatMonth(month: IsoMonth): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

export function formatWeekRange(weekStart: IsoDate): string {
  const end = addDays(weekStart, 6);
  return `${formatDayMonth(weekStart)} – ${formatDate(end)}`;
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: APP_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
