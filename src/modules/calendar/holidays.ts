import { HebrewCalendar, type HDate } from "@hebcal/core";
import { parseIsoDate, type IsoDate } from "@/lib/dates";
import type { DayInfo, DayKind } from "./types";

/**
 * Israeli holidays from the built-in Hebrew calendar (@hebcal/core, Israel schedule).
 * Keys are hebcal's English descriptions; anything not listed is ignored.
 */
const CLOSED = new Set([
  "Rosh Hashana II",
  "Yom Kippur",
  "Sukkot I",
  "Shmini Atzeret",
  "Pesach I",
  "Pesach VII",
  "Shavuot",
  "Yom HaAtzma'ut",
]);
const EVE = new Set([
  "Erev Rosh Hashana",
  "Erev Yom Kippur",
  "Erev Sukkot",
  "Sukkot VII (Hoshana Raba)",
  "Erev Pesach",
  "Pesach VI (CH''M)",
  "Erev Shavuot",
  "Yom HaZikaron",
]);
/** Shown on the schedule but worked as usual. */
const LABEL = new Set([
  "Purim",
  "Shushan Purim",
  "Yom HaShoah",
  "Tu BiShvat",
  "Lag BaOmer",
  "Yom Yerushalayim",
  "Tish'a B'Av",
]);

function classify(desc: string): DayKind | "label" | null {
  if (desc.startsWith("Rosh Hashana ") && /\d{4}$/.test(desc)) return "closed"; // first day
  if (CLOSED.has(desc)) return "closed";
  if (EVE.has(desc)) return "eve";
  if (LABEL.has(desc) || desc.includes("(CH''M)") || desc.startsWith("Chanukah")) return "label";
  return null;
}

function hebrewName(desc: string, rendered: string): string {
  if (desc.startsWith("Chanukah")) return "חנוכה";
  if (desc === "Pesach VI (CH''M)") return "ערב שביעי של פסח";
  return rendered.replace(/\s*\d{4}$/, "").trim(); // "ראש השנה 5787" → "ראש השנה"
}

function isoOf(hd: HDate): IsoDate {
  const d = hd.greg(); // local midnight
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const RANK: Record<DayKind | "label", number> = { closed: 3, eve: 2, label: 1, regular: 0 };

/** Holidays between two dates (inclusive). Dates without anything notable are left out. */
export function calendarDays(from: IsoDate, to: IsoDate): Record<IsoDate, DayInfo> {
  const toLocal = (iso: IsoDate) => {
    const d = parseIsoDate(iso);
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  };
  const events = HebrewCalendar.calendar({
    start: toLocal(from),
    end: toLocal(to),
    il: true,
    noMinorFast: true,
    noSpecialShabbat: true,
    noRoshChodesh: true,
  });
  const out: Record<IsoDate, DayInfo> = {};
  const ranks: Record<IsoDate, number> = {};
  for (const ev of events) {
    const desc = ev.getDesc();
    const kind = classify(desc);
    if (!kind) continue;
    const date = isoOf(ev.getDate());
    // When two events share a date, the one that affects work most wins (closed > eve > label).
    if ((ranks[date] ?? -1) >= RANK[kind]) continue;
    ranks[date] = RANK[kind];
    out[date] = {
      kind: kind === "label" ? "regular" : kind,
      name: hebrewName(desc, ev.render("he-x-NoNikud")),
      source: "calendar",
    };
  }
  return out;
}

/** Convenience for a list of consecutive or scattered dates. */
export function calendarDaysFor(dates: IsoDate[]): Record<IsoDate, DayInfo> {
  if (dates.length === 0) return {};
  const sorted = [...dates].sort();
  const all = calendarDays(sorted[0], sorted[sorted.length - 1]);
  const wanted = new Set(dates);
  return Object.fromEntries(Object.entries(all).filter(([d]) => wanted.has(d)));
}
