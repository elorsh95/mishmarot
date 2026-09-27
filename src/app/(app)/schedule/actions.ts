"use server";

import { z } from "zod";
import { runAction } from "@/lib/action";
import { isIsoDate } from "@/lib/dates";
import {
  clearWeek,
  copyPreviousWeek,
  fillFromDefaults,
  setAbsenceRange,
  setDayEntry,
  setEntries,
  setWeekStatus,
} from "@/modules/schedule/service";
import type { ApplyResult } from "@/modules/schedule/engine";

const date = z.string().refine(isIsoDate, "תאריך לא תקין");

const entrySchema = z
  .discriminatedUnion("kind", [
    z.object({
      kind: z.literal("shift"),
      shiftId: z.string().min(1, "יש לבחור משמרת"),
      locationId: z.string().min(1, "יש לבחור מיקום עבודה"),
      note: z.string().max(300).optional(),
    }),
    z.object({
      kind: z.literal("absence"),
      absenceTypeId: z.string().min(1, "יש לבחור סוג היעדרות"),
      note: z.string().max(300).optional(),
    }),
  ])
  .nullable();

const REVALIDATE = ["/schedule", "/approvals", "/"];

function summarize(result: ApplyResult, verb: string) {
  const parts = [`${verb} ${result.changed} שיבוצים`];
  if (result.pendingApprovalIds.length > 0) {
    parts.push(`${result.pendingApprovalIds.length} מהם ממתינים לאישור מנהלת המוקד`);
  }
  if (result.skipped.length > 0) parts.push(`${result.skipped.length} דולגו`);
  return parts.join(" · ");
}

export async function setEntryAction(agentId: string, day: string, entry: unknown) {
  return runAction(
    async (actor) => {
      const result = await setDayEntry(
        actor,
        z.string().min(1).parse(agentId),
        date.parse(day),
        entrySchema.parse(entry),
      );
      return { pending: result.pendingApprovalIds.length > 0 };
    },
    { revalidate: REVALIDATE },
  );
}

export async function setWeekStatusAction(teamId: string, weekStart: string, status: unknown) {
  const parsed = z.enum(["draft", "published"]).parse(status);
  return runAction((actor) => setWeekStatus(actor, teamId, date.parse(weekStart), parsed), {
    revalidate: REVALIDATE,
    message: parsed === "published" ? "הסידור פורסם" : "הסידור הוחזר לטיוטה",
  });
}

export async function copyPreviousWeekAction(teamId: string, weekStart: string) {
  return runAction(
    async (actor) => {
      const result = await copyPreviousWeek(actor, teamId, date.parse(weekStart));
      return {
        summary:
          result.changed === 0 && result.skipped.length === 0
            ? "אין מה להעתיק: השבוע הקודם ריק או שהימים כבר משובצים"
            : summarize(result, "הועתקו"),
        skipped: result.skipped,
      };
    },
    { revalidate: REVALIDATE },
  );
}

export async function fillDefaultsAction(teamId: string, weekStart: string) {
  return runAction(
    async (actor) => {
      const result = await fillFromDefaults(actor, teamId, date.parse(weekStart));
      return {
        summary:
          result.changed === 0 && result.skipped.length === 0
            ? "לא נמצאו ימים ריקים לנציגים עם ברירת מחדל"
            : summarize(result, "נוספו"),
        skipped: result.skipped,
      };
    },
    { revalidate: REVALIDATE },
  );
}

export async function clearWeekAction(teamId: string, weekStart: string) {
  return runAction(
    async (actor) => {
      const result = await clearWeek(actor, teamId, date.parse(weekStart));
      return { summary: summarize(result, "הוסרו"), skipped: result.skipped };
    },
    { revalidate: REVALIDATE },
  );
}

const absenceSchema = z.object({
  kind: z.literal("absence"),
  absenceTypeId: z.string().min(1, "יש לבחור סוג היעדרות"),
  note: z.string().max(300).optional(),
});

export async function setAbsenceRangeAction(
  agentId: string,
  from: string,
  to: string,
  entry: unknown,
  workDaysOnly: boolean,
) {
  return runAction(
    async (actor) => {
      const result = await setAbsenceRange(
        actor,
        z.string().min(1).parse(agentId),
        date.parse(from),
        date.parse(to),
        absenceSchema.parse(entry),
        { workDaysOnly: Boolean(workDaysOnly) },
      );
      return {
        summary:
          result.changed === 0 && result.skipped.length === 0
            ? "לא נמצאו ימים לעדכון בטווח"
            : summarize(result, "עודכנו"),
        skipped: result.skipped,
      };
    },
    { revalidate: REVALIDATE },
  );
}

const cellsSchema = z
  .array(z.object({ agentId: z.string().min(1), date }))
  .min(1, "לא נבחרו משבצות");

export async function setEntriesAction(cells: unknown, entry: unknown) {
  return runAction(
    async (actor) => {
      const parsed = entrySchema.parse(entry);
      const result = await setEntries(actor, cellsSchema.parse(cells), parsed);
      return {
        summary: summarize(result, parsed ? "עודכנו" : "הוסרו"),
        skipped: result.skipped,
      };
    },
    { revalidate: REVALIDATE },
  );
}
