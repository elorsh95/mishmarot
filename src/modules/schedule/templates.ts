import { z } from "zod";
import { db } from "@/lib/firebase/admin";
import { col, COLLECTIONS, fromDoc, serverNow } from "@/lib/firebase/collections";
import { addDays, weekDates, weekdayOf, weekStartOf, type IsoDate } from "@/lib/dates";
import { DomainError, NotFoundError } from "@/lib/errors";
import { auditInTx } from "@/modules/audit/service";
import { getDayInfos } from "@/modules/calendar/service";
import { shiftRunsOn } from "@/modules/calendar/types";
import { getCatalog } from "@/modules/catalog/service";
import { assertCanForTeam, type Actor } from "@/modules/permissions/check";
import { applyChanges, noChanges, type ApplyResult } from "./engine";
import {
  assignmentId,
  TEMPLATE_MAX_PER_TEAM,
  type Assignment,
  type ChangeOp,
  type WeekTemplateSummary,
} from "./types";

/**
 * Week templates: a team's shift assignments by weekday, saved under a name ("שבוע רגיל",
 * "שבוע חגים") and applied to any week. Applying fills empty days only, like copying the
 * previous week, and goes through applyChanges.
 */

interface TemplateEntry {
  agentId: string;
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
  shiftId: string;
  locationId: string;
  note: string;
}

interface TemplateDoc {
  id: string;
  teamId: string;
  name: string;
  entries: TemplateEntry[];
  updatedByName: string;
  /** ISO time (fromDoc converts timestamps). */
  updatedAt?: string;
}

const nameSchema = z.string().trim().min(2, "שם התבנית קצר מדי").max(40, "שם התבנית ארוך מדי");

function summary(t: TemplateDoc): WeekTemplateSummary {
  return {
    id: t.id,
    teamId: t.teamId,
    name: t.name,
    size: t.entries.length,
    updatedByName: t.updatedByName,
    updatedAt: t.updatedAt ?? null,
  };
}

export async function listTemplates(actor: Actor, teamId: string): Promise<WeekTemplateSummary[]> {
  assertCanForTeam(actor, "schedule.view", teamId);
  const snap = await col(COLLECTIONS.weekTemplates).where("teamId", "==", teamId).get();
  return snap.docs
    .map((d) => summary(fromDoc<TemplateDoc>(d)))
    .sort((a, b) => a.name.localeCompare(b.name, "he"));
}

/** Saves the team's week as a template. A template with the same name is replaced. */
export async function saveTemplate(
  actor: Actor,
  teamId: string,
  weekStartInput: IsoDate,
  nameInput: string,
): Promise<string> {
  assertCanForTeam(actor, "schedule.edit", teamId);
  const name = nameSchema.parse(nameInput);
  const weekStart = weekStartOf(weekStartInput);
  const [weekSnap, existingSnap] = await Promise.all([
    col(COLLECTIONS.assignments)
      .where("teamId", "==", teamId)
      .where("weekStart", "==", weekStart)
      .get(),
    col(COLLECTIONS.weekTemplates).where("teamId", "==", teamId).get(),
  ]);
  const entries: TemplateEntry[] = weekSnap.docs
    .map((d) => fromDoc<Assignment>(d))
    .filter((a) => a.kind === "shift" && a.shiftId && a.locationId)
    .map((a) => ({
      agentId: a.agentId,
      weekday: weekdayOf(a.date),
      shiftId: a.shiftId!,
      locationId: a.locationId!,
      note: a.note ?? "",
    }));
  if (entries.length === 0) throw new DomainError("אין שיבוצי משמרת בשבוע הזה לשמירה כתבנית");

  const same = existingSnap.docs.find((d) => d.get("name") === name);
  if (!same && existingSnap.size >= TEMPLATE_MAX_PER_TEAM) {
    throw new DomainError(`אפשר לשמור עד ${TEMPLATE_MAX_PER_TEAM} תבניות לצוות. מחקו תבנית ישנה`);
  }
  const ref = same ? same.ref : col(COLLECTIONS.weekTemplates).doc();
  await db().runTransaction(async (tx) => {
    tx.set(ref, {
      teamId,
      name,
      entries,
      updatedBy: actor.id,
      updatedByName: actor.fullName,
      updatedAt: serverNow(),
    });
    auditInTx(tx, actor, {
      action: same ? "template.update" : "template.create",
      entityType: "week",
      entityId: ref.id,
      teamId,
      summary: `${same ? "עודכנה" : "נשמרה"} תבנית "${name}" (${entries.length} שיבוצים)`,
    });
  });
  return ref.id;
}

async function getTemplate(id: string): Promise<TemplateDoc> {
  const snap = await col(COLLECTIONS.weekTemplates).doc(id).get();
  if (!snap.exists) throw new NotFoundError("התבנית לא נמצאה");
  return fromDoc<TemplateDoc>(snap);
}

/** Fills the week's empty days from a template. */
export async function applyTemplate(
  actor: Actor,
  templateId: string,
  weekStartInput: IsoDate,
): Promise<ApplyResult> {
  const template = await getTemplate(templateId);
  assertCanForTeam(actor, "schedule.edit", template.teamId);
  const weekStart = weekStartOf(weekStartInput);
  const days = weekDates(weekStart);
  const [existingSnap, agentsSnap, catalog, dayInfo] = await Promise.all([
    col(COLLECTIONS.assignments)
      .where("teamId", "==", template.teamId)
      .where("weekStart", "==", weekStart)
      .get(),
    col(COLLECTIONS.agents)
      .where("teamId", "==", template.teamId)
      .where("isActive", "==", true)
      .get(),
    getCatalog(),
    getDayInfos(days),
  ]);
  const existing = new Set(existingSnap.docs.map((d) => d.id));
  const activeAgents = new Set(agentsSnap.docs.map((d) => d.id));
  const ops: ChangeOp[] = [];
  for (const e of template.entries) {
    // Agents who left the team or were deactivated since are skipped quietly.
    if (!activeAgents.has(e.agentId)) continue;
    const date = addDays(weekStart, e.weekday);
    if (existing.has(assignmentId(e.agentId, date))) continue;
    const shift = catalog.shifts.find((s) => s.id === e.shiftId);
    if (shift && !shiftRunsOn(shift, date, dayInfo[date])) continue;
    ops.push({
      agentId: e.agentId,
      date,
      entry: { kind: "shift", shiftId: e.shiftId, locationId: e.locationId, note: e.note },
    });
  }
  if (ops.length === 0) return noChanges();
  return applyChanges(actor, ops, { mode: "bulk" });
}

export async function deleteTemplate(actor: Actor, templateId: string) {
  const template = await getTemplate(templateId);
  assertCanForTeam(actor, "schedule.edit", template.teamId);
  await db().runTransaction(async (tx) => {
    tx.delete(col(COLLECTIONS.weekTemplates).doc(templateId));
    auditInTx(tx, actor, {
      action: "template.delete",
      entityType: "week",
      entityId: templateId,
      teamId: template.teamId,
      summary: `נמחקה תבנית "${template.name}"`,
    });
  });
}
