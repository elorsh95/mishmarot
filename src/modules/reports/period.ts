/**
 * Report date ranges: a preset period around a date (day, week, month, the last 3 months) or a
 * free range. Pure and client-safe, so the filters, the page and the export share one parser.
 */
import {
  addDays,
  addMonths,
  formatDate,
  formatDateWithDay,
  formatMonth,
  formatWeekRange,
  isIsoDate,
  MONTH_NAMES,
  monthOf,
  monthRange,
  parseIsoDate,
  weekStartOf,
  type IsoDate,
} from "@/lib/dates";

export type ReportPeriod = "day" | "week" | "month" | "quarter" | "range";

export const REPORT_PERIOD_LABELS: Record<ReportPeriod, string> = {
  day: "יום",
  week: "שבוע",
  month: "חודש",
  quarter: "3 חודשים",
  range: "טווח תאריכים",
};

/** A free range may span at most this many days. */
export const REPORT_MAX_DAYS = 366;

export interface ReportRange {
  period: ReportPeriod;
  from: IsoDate;
  to: IsoDate;
}

export type ReportView = "agents" | "shifts";

/** The preset period that contains `date` (for "quarter": the 3 months ending in date's month). */
export function presetRange(period: Exclude<ReportPeriod, "range">, date: IsoDate): ReportRange {
  switch (period) {
    case "day":
      return { period, from: date, to: date };
    case "week": {
      const from = weekStartOf(date);
      return { period, from, to: addDays(from, 6) };
    }
    case "month":
      return { period, ...monthRange(monthOf(date)) };
    case "quarter": {
      const month = monthOf(date);
      return { period, from: monthRange(addMonths(month, -2)).from, to: monthRange(month).to };
    }
  }
}

export function daysInRange(range: Pick<ReportRange, "from" | "to">): number {
  return (parseIsoDate(range.to).getTime() - parseIsoDate(range.from).getTime()) / 86_400_000 + 1;
}

type Params = Record<string, string | string[] | undefined>;

/**
 * Reads the range from URL params: `period` with `date`, or `period=range` with `from` and `to`.
 * The older `month=YYYY-MM` links still work. Anything invalid falls back to this month.
 */
export function parseReportRange(params: Params, today: IsoDate): ReportRange {
  const str = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : "");
  const period = str("period");
  if (period === "range") {
    let [from, to] = [str("from"), str("to")];
    if (isIsoDate(from) && isIsoDate(to)) {
      if (from > to) [from, to] = [to, from];
      if (daysInRange({ from, to }) > REPORT_MAX_DAYS) to = addDays(from, REPORT_MAX_DAYS - 1);
      return { period, from, to };
    }
  }
  if (period === "day" || period === "week" || period === "month" || period === "quarter") {
    const date = str("date");
    return presetRange(period, isIsoDate(date) ? date : today);
  }
  const month = str("month");
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return presetRange("month", `${month}-01`);
  return presetRange("month", today);
}

/** URL params for a range, the inverse of parseReportRange. */
export function reportRangeParams(range: ReportRange): Record<string, string> {
  return range.period === "range"
    ? { period: "range", from: range.from, to: range.to }
    : { period: range.period, date: range.to };
}

/** The next (1) or previous (-1) range of the same kind. */
export function stepRange(range: ReportRange, direction: 1 | -1): ReportRange {
  switch (range.period) {
    case "day":
    case "week":
      return presetRange(range.period, addDays(range.from, direction * daysInRange(range)));
    case "month":
      return presetRange("month", `${addMonths(monthOf(range.from), direction)}-01`);
    case "quarter":
      return presetRange("quarter", `${addMonths(monthOf(range.to), direction * 3)}-01`);
    case "range": {
      const shift = direction * daysInRange(range);
      return { period: "range", from: addDays(range.from, shift), to: addDays(range.to, shift) };
    }
  }
}

export function reportRangeLabel(range: ReportRange): string {
  switch (range.period) {
    case "day":
      return formatDateWithDay(range.from);
    case "week":
      return formatWeekRange(range.from);
    case "month":
      return formatMonth(monthOf(range.from));
    case "quarter": {
      const first = Number(range.from.slice(5, 7));
      return `${MONTH_NAMES[first - 1]} – ${formatMonth(monthOf(range.to))}`;
    }
    case "range":
      return range.from === range.to
        ? formatDate(range.from)
        : `${formatDate(range.from)} – ${formatDate(range.to)}`;
  }
}
