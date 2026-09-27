import type { Transaction } from "firebase-admin/firestore";
import { z } from "zod";
import { db } from "@/lib/firebase/admin";
import { col, COLLECTIONS, fromDoc, serverNow } from "@/lib/firebase/collections";
import { formatDateWithDay, isIsoDate, type IsoDate } from "@/lib/dates";
import { NotFoundError } from "@/lib/errors";
import { auditInTx } from "@/modules/audit/service";
import { assertCan, type Actor } from "@/modules/permissions/check";
import { calendarDaysFor } from "./holidays";
import { DAY_KIND_LABELS, REGULAR_DAY, type DayInfo, type SpecialDay } from "./types";

/**
 * How each date is worked: the built-in Israeli calendar, overridden by special days that the
 * admin or center manager set (e.g. a Chol HaMoed worked as an eve, or an extra closed day).
 */
function merge(dates: IsoDate[], overrides: SpecialDay[]): Record<IsoDate, DayInfo> {
  const calendar = calendarDaysFor(dates);
  const custom = new Map(overrides.map((s) => [s.date, s]));
  const out: Record<IsoDate, DayInfo> = {};
  for (const date of dates) {
    const own = custom.get(date);
    out[date] = own
      ? { kind: own.kind, name: own.name || calendar[date]?.name || null, source: "custom" }
      : (calendar[date] ?? REGULAR_DAY);
  }
  return out;
}

export async function getDayInfos(dates: IsoDate[]): Promise<Record<IsoDate, DayInfo>> {
  const unique = [...new Set(dates)];
  if (unique.length === 0) return {};
  const snaps = await db().getAll(...unique.map((d) => col(COLLECTIONS.specialDays).doc(d)));
  return merge(
    unique,
    snaps.filter((s) => s.exists).map((s) => fromDoc<SpecialDay>(s)),
  );
}

/** Same as getDayInfos, read inside a transaction (the schedule engine). */
export async function getDayInfosInTx(
  tx: Transaction,
  dates: IsoDate[],
): Promise<Record<IsoDate, DayInfo>> {
  const unique = [...new Set(dates)];
  if (unique.length === 0) return {};
  const snaps = await tx.getAll(...unique.map((d) => col(COLLECTIONS.specialDays).doc(d)));
  return merge(
    unique,
    snaps.filter((s) => s.exists).map((s) => fromDoc<SpecialDay>(s)),
  );
}

export interface CalendarRow {
  date: IsoDate;
  /** What the built-in calendar says (regular with no name if nothing). */
  calendar: DayInfo;
  /** The override, if any. */
  custom: SpecialDay | null;
}

/** Holidays and special days in a date range, for the settings screen. */
export async function listCalendar(from: IsoDate, to: IsoDate): Promise<CalendarRow[]> {
  const snap = await col(COLLECTIONS.specialDays)
    .where("date", ">=", from)
    .where("date", "<=", to)
    .get();
  const custom = new Map(snap.docs.map((d) => [d.id, fromDoc<SpecialDay>(d)]));
  const dates: IsoDate[] = [];
  for (let d = from; d <= to; d = nextDay(d)) dates.push(d);
  const calendar = calendarDaysFor(dates);
  return dates
    .filter((d) => calendar[d] || custom.has(d))
    .map((date) => ({
      date,
      calendar: calendar[date] ?? REGULAR_DAY,
      custom: custom.get(date) ?? null,
    }));
}

function nextDay(date: IsoDate): IsoDate {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export const specialDaySchema = z.object({
  date: z.string().refine(isIsoDate, "תאריך לא תקין"),
  kind: z.enum(["regular", "eve", "closed"]),
  name: z.string().trim().max(40).default(""),
});

export async function setSpecialDay(actor: Actor, input: z.input<typeof specialDaySchema>) {
  assertCan(actor, "catalog.manage");
  const data = specialDaySchema.parse(input);
  const ref = col(COLLECTIONS.specialDays).doc(data.date);
  await db().runTransaction(async (tx) => {
    const before = await tx.get(ref);
    const record = {
      date: data.date,
      kind: data.kind,
      name: data.name,
      updatedByName: actor.fullName,
    };
    tx.set(ref, { ...record, updatedBy: actor.id, updatedAt: serverNow() });
    auditInTx(tx, actor, {
      action: "calendar.set",
      entityType: "calendar",
      entityId: data.date,
      summary: `${formatDateWithDay(data.date)} הוגדר כ${DAY_KIND_LABELS[data.kind]}${data.name ? ` (${data.name})` : ""}`,
      before: before.exists ? before.data() : null,
      after: record,
    });
  });
}

/** Removes an override: the date goes back to the built-in calendar. */
export async function clearSpecialDay(actor: Actor, date: IsoDate) {
  assertCan(actor, "catalog.manage");
  const ref = col(COLLECTIONS.specialDays).doc(date);
  await db().runTransaction(async (tx) => {
    const before = await tx.get(ref);
    if (!before.exists) throw new NotFoundError("לא נמצאה הגדרה לתאריך זה");
    tx.delete(ref);
    auditInTx(tx, actor, {
      action: "calendar.clear",
      entityType: "calendar",
      entityId: date,
      summary: `${formatDateWithDay(date)} חזר להגדרת לוח השנה`,
      before: before.data(),
    });
  });
}
