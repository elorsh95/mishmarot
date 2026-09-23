import { isIsoDate, weekdayOf, weekStartOf, type IsoDate } from "@/lib/dates";
import type { Catalog } from "@/modules/catalog/service";
import { canForTeam, type Actor } from "@/modules/permissions/check";
import type { EntryInput, WeekStatus } from "./types";

/** A week is locked once it is in the past (before the current week). */
export function isPastWeek(date: IsoDate, today: IsoDate) {
  return weekStartOf(date) < weekStartOf(today);
}

/** Why the actor may not edit this team's day, or null if allowed. */
export function editBlockReason(
  actor: Actor,
  teamId: string,
  date: IsoDate,
  weekStatus: WeekStatus,
  today: IsoDate,
): string | null {
  if (!canForTeam(actor, "schedule.edit", teamId)) return "אין לך הרשאה לערוך את הסידור של צוות זה";
  const canOverride = canForTeam(actor, "schedule.editLocked", teamId);
  if (isPastWeek(date, today) && !canOverride) return "שבוע שעבר נעול לעריכה";
  if (weekStatus === "published" && !canOverride) {
    return "הסידור של שבוע זה פורסם. כדי לערוך יש להחזיר אותו לטיוטה";
  }
  return null;
}

/** Validates an entry against the catalog for a given date. Returns an error or null. */
export function entryError(catalog: Catalog, entry: EntryInput, date: IsoDate): string | null {
  if (!isIsoDate(date)) return "תאריך לא תקין";
  if (entry.kind === "shift") {
    const shift = catalog.shifts.find((s) => s.id === entry.shiftId);
    if (!shift || !shift.isActive) return "המשמרת לא קיימת או לא פעילה";
    if (!shift.daysOfWeek.includes(weekdayOf(date))) {
      return `משמרת "${shift.name}" לא מתקיימת ביום זה`;
    }
    const location = catalog.locations.find((l) => l.id === entry.locationId);
    if (!location || !location.isActive) return "יש לבחור מיקום עבודה פעיל";
    return null;
  }
  const absence = catalog.absenceTypes.find((a) => a.id === entry.absenceTypeId);
  if (!absence || !absence.isActive) return "סוג ההיעדרות לא קיים או לא פעיל";
  return null;
}

export function describeEntry(
  catalog: Catalog,
  entry: {
    kind: string;
    shiftId?: string | null;
    locationId?: string | null;
    absenceTypeId?: string | null;
  },
): string {
  if (entry.kind === "absence") {
    return catalog.absenceTypes.find((a) => a.id === entry.absenceTypeId)?.name ?? "היעדרות";
  }
  const shift = catalog.shifts.find((s) => s.id === entry.shiftId)?.name ?? "משמרת";
  const location = catalog.locations.find((l) => l.id === entry.locationId)?.name ?? "";
  return location ? `${shift} · ${location}` : shift;
}
