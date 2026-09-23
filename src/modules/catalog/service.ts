import { cache } from "react";
import { z } from "zod";
import { db } from "@/lib/firebase/admin";
import { col, COLLECTIONS, fromDoc, fromDocOrNull, serverNow } from "@/lib/firebase/collections";
import { DomainError, NotFoundError } from "@/lib/errors";
import { auditInTx } from "@/modules/audit/service";
import type { AuditEntityType } from "@/modules/audit/types";
import { assertCan, type Actor } from "@/modules/permissions/check";

/**
 * Editable lists that drive the schedule: shifts, work locations and absence types.
 * They share one generic CRUD implementation.
 */

export interface Shift {
  id: string;
  name: string;
  /** 0 = Sunday … 6 = Saturday */
  daysOfWeek: number[];
  /** Minimum agents wanted per day (optional). */
  requiredAgents: number | null;
  /** Coverage: a double shift covers both. */
  coversMorning: boolean;
  coversEvening: boolean;
  color: string;
  sortOrder: number;
  isActive: boolean;
}

export interface WorkLocation {
  id: string;
  name: string;
  /** Days at this location count toward the agent's monthly quota and need approval beyond it. */
  requiresQuota: boolean;
  color: string;
  sortOrder: number;
  isActive: boolean;
}

export interface AbsenceType {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  isActive: boolean;
}

const base = {
  name: z.string().trim().min(1, "יש להזין שם").max(40),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "צבע לא תקין")
    .default("#64748b"),
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.boolean().default(true),
};

export const shiftInputSchema = z
  .object({
    ...base,
    daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1, "יש לבחור לפחות יום אחד"),
    requiredAgents: z.coerce.number().int().min(0).nullable().default(null),
    coversMorning: z.boolean(),
    coversEvening: z.boolean(),
  })
  .refine((s) => s.coversMorning || s.coversEvening, "משמרת צריכה לכסות בוקר, ערב או שניהם");

export const locationInputSchema = z.object({ ...base, requiresQuota: z.boolean().default(false) });
export const absenceTypeInputSchema = z.object(base);

type Kind = "shifts" | "locations" | "absenceTypes";

const KIND_META: Record<Kind, { entity: AuditEntityType; label: string }> = {
  shifts: { entity: "shift", label: "משמרת" },
  locations: { entity: "location", label: "מיקום עבודה" },
  absenceTypes: { entity: "absenceType", label: "סוג היעדרות" },
};

async function listKind<T extends { sortOrder: number; name: string }>(kind: Kind): Promise<T[]> {
  const snap = await col(COLLECTIONS[kind]).get();
  return snap.docs
    .map((d) => fromDoc<T>(d))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "he"));
}

export const listShifts = cache(() => listKind<Shift>("shifts"));
export const listLocations = cache(() => listKind<WorkLocation>("locations"));
export const listAbsenceTypes = cache(() => listKind<AbsenceType>("absenceTypes"));

export interface Catalog {
  shifts: Shift[];
  locations: WorkLocation[];
  absenceTypes: AbsenceType[];
}

export const getCatalog = cache(async (): Promise<Catalog> => {
  const [shifts, locations, absenceTypes] = await Promise.all([
    listShifts(),
    listLocations(),
    listAbsenceTypes(),
  ]);
  return { shifts, locations, absenceTypes };
});

async function upsert(
  actor: Actor,
  kind: Kind,
  id: string | null,
  data: object & { name: string },
) {
  assertCan(actor, "catalog.manage");
  const meta = KIND_META[kind];
  const dup = await col(COLLECTIONS[kind]).where("name", "==", data.name).get();
  if (dup.docs.some((d) => d.id !== id)) throw new DomainError(`כבר קיים/ת ${meta.label} בשם זה`);

  const ref = id ? col(COLLECTIONS[kind]).doc(id) : col(COLLECTIONS[kind]).doc();
  await db().runTransaction(async (tx) => {
    const before = id ? fromDocOrNull<object>(await tx.get(ref)) : null;
    if (id && !before) throw new NotFoundError();
    if (id) tx.update(ref, { ...data, updatedAt: serverNow() });
    else tx.set(ref, { ...data, createdAt: serverNow(), updatedAt: serverNow() });
    auditInTx(tx, actor, {
      action: `${meta.entity}.${id ? "update" : "create"}`,
      entityType: meta.entity,
      entityId: ref.id,
      summary: `${id ? "עודכן/ה" : "נוסף/ה"} ${meta.label} "${data.name}"`,
      before,
      after: data,
    });
  });
  return ref.id;
}

export function saveShift(
  actor: Actor,
  id: string | null,
  input: z.input<typeof shiftInputSchema>,
) {
  const data = shiftInputSchema.parse(input);
  data.daysOfWeek = [...new Set(data.daysOfWeek)].sort();
  return upsert(actor, "shifts", id, data);
}

export function saveLocation(
  actor: Actor,
  id: string | null,
  input: z.input<typeof locationInputSchema>,
) {
  return upsert(actor, "locations", id, locationInputSchema.parse(input));
}

export function saveAbsenceType(
  actor: Actor,
  id: string | null,
  input: z.input<typeof absenceTypeInputSchema>,
) {
  return upsert(actor, "absenceTypes", id, absenceTypeInputSchema.parse(input));
}

/** Seeds default catalog entries into empty collections. Idempotent. */
export async function ensureDefaultCatalog() {
  const defaults: Record<Kind, Array<Record<string, unknown>>> = {
    shifts: [
      {
        name: "בוקר",
        daysOfWeek: [0, 1, 2, 3, 4, 5],
        requiredAgents: null,
        coversMorning: true,
        coversEvening: false,
        color: "#0ea5e9",
        sortOrder: 1,
        isActive: true,
      },
      {
        name: "ערב",
        daysOfWeek: [0, 1, 2, 3, 4],
        requiredAgents: null,
        coversMorning: false,
        coversEvening: true,
        color: "#8b5cf6",
        sortOrder: 2,
        isActive: true,
      },
      {
        name: "כפולה",
        daysOfWeek: [0, 1, 2, 3, 4],
        requiredAgents: null,
        coversMorning: true,
        coversEvening: true,
        color: "#f97316",
        sortOrder: 3,
        isActive: true,
      },
    ],
    locations: [
      { name: "מוקד", requiresQuota: false, color: "#16a34a", sortOrder: 1, isActive: true },
      { name: "בית", requiresQuota: true, color: "#db2777", sortOrder: 2, isActive: true },
    ],
    absenceTypes: [
      { name: "חופשה", color: "#0d9488", sortOrder: 1, isActive: true },
      { name: "מחלה", color: "#dc2626", sortOrder: 2, isActive: true },
      { name: "מילואים", color: "#4d7c0f", sortOrder: 3, isActive: true },
      { name: "אחר", color: "#6b7280", sortOrder: 4, isActive: true },
    ],
  };
  for (const kind of Object.keys(defaults) as Kind[]) {
    const existing = await col(COLLECTIONS[kind]).limit(1).get();
    if (!existing.empty) continue;
    const batch = db().batch();
    for (const item of defaults[kind]) {
      batch.set(col(COLLECTIONS[kind]).doc(), {
        ...item,
        createdAt: serverNow(),
        updatedAt: serverNow(),
      });
    }
    await batch.commit();
  }
}
