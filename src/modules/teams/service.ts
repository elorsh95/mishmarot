import { FieldValue, type Transaction } from "firebase-admin/firestore";
import { cache } from "react";
import { z } from "zod";
import { db } from "@/lib/firebase/admin";
import { col, COLLECTIONS, fromDoc, fromDocOrNull, serverNow } from "@/lib/firebase/collections";
import { DomainError, NotFoundError } from "@/lib/errors";
import { auditInTx } from "@/modules/audit/service";
import type { PermissionKey } from "@/modules/permissions/catalog";
import { assertCan, teamScope, type Actor } from "@/modules/permissions/check";
import type { Activity } from "./types";

export interface Team {
  id: string;
  name: string;
  isActive: boolean;
  managerIds: string[];
  sortOrder: number;
  /** Agents needed on the morning / evening each work day. 0 = only warn when nobody is on. */
  minMorning: number;
  minEvening: number;
  /** The activity (line of business) the team belongs to, if any. */
  activityId: string | null;
}

/** Teams saved before the staffing minimums and activities existed have neither. */
function withDefaults(team: Team): Team {
  return {
    ...team,
    minMorning: team.minMorning ?? 0,
    minEvening: team.minEvening ?? 0,
    activityId: team.activityId ?? null,
  };
}

export const listAllTeams = cache(async (): Promise<Team[]> => {
  const snap = await col(COLLECTIONS.teams).get();
  return snap.docs
    .map((d) => withDefaults(fromDoc<Team>(d)))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "he"));
});

export async function getTeam(id: string): Promise<Team | null> {
  const team = fromDocOrNull<Team>(await col(COLLECTIONS.teams).doc(id).get());
  return team ? withDefaults(team) : null;
}

/** Active teams the actor can access for a permission. */
export async function teamsForActor(
  actor: Actor,
  permission: PermissionKey,
  { includeInactive = false } = {},
): Promise<Team[]> {
  const scope = teamScope(actor, permission);
  const teams = (await listAllTeams()).filter((t) => includeInactive || t.isActive);
  return scope === "all" ? teams : teams.filter((t) => scope.includes(t.id));
}

export async function managedTeamIds(userId: string): Promise<string[]> {
  const snap = await col(COLLECTIONS.teams).where("managerIds", "array-contains", userId).get();
  return snap.docs.map((d) => d.id);
}

export const teamInputSchema = z.object({
  name: z.string().trim().min(2, "שם צוות קצר מדי").max(40),
  isActive: z.boolean().default(true),
  managerIds: z.array(z.string()).default([]),
  sortOrder: z.coerce.number().int().default(0),
  minMorning: z.coerce.number().int().min(0, "לא יכול להיות שלילי").max(99).default(0),
  minEvening: z.coerce.number().int().min(0, "לא יכול להיות שלילי").max(99).default(0),
  activityId: z
    .string()
    .nullish()
    .transform((v) => v || null),
});
export type TeamInput = z.infer<typeof teamInputSchema>;

async function assertUniqueName(name: string, exceptId?: string) {
  const dup = await col(COLLECTIONS.teams).where("name", "==", name).get();
  if (dup.docs.some((d) => d.id !== exceptId)) throw new DomainError("כבר קיים צוות בשם זה");
}

async function assertActivityExists(activityId: string | null) {
  if (activityId && !(await col(COLLECTIONS.activities).doc(activityId).get()).exists) {
    throw new DomainError("הפעילות לא נמצאה");
  }
}

export async function createTeam(actor: Actor, input: TeamInput) {
  assertCan(actor, "teams.manage");
  const data = teamInputSchema.parse(input);
  await assertUniqueName(data.name);
  await assertActivityExists(data.activityId);
  const ref = col(COLLECTIONS.teams).doc();
  await db().runTransaction(async (tx) => {
    tx.set(ref, { ...data, createdAt: serverNow(), updatedAt: serverNow() });
    auditInTx(tx, actor, {
      action: "team.create",
      entityType: "team",
      entityId: ref.id,
      teamId: ref.id,
      summary: `נוצר צוות "${data.name}"`,
      after: data,
    });
  });
  return ref.id;
}

export async function updateTeam(actor: Actor, teamId: string, input: TeamInput) {
  assertCan(actor, "teams.manage");
  const data = teamInputSchema.parse(input);
  await assertUniqueName(data.name, teamId);
  await assertActivityExists(data.activityId);
  const ref = col(COLLECTIONS.teams).doc(teamId);
  await db().runTransaction(async (tx) => {
    const before = fromDocOrNull<Team>(await tx.get(ref));
    if (!before) throw new NotFoundError("הצוות לא נמצא");
    if (before.isActive && !data.isActive) {
      const agents = await tx.get(
        col(COLLECTIONS.agents)
          .where("teamId", "==", teamId)
          .where("isActive", "==", true)
          .limit(1),
      );
      if (!agents.empty) throw new DomainError("לא ניתן להשבית צוות שיש בו נציגים פעילים");
    }
    tx.update(ref, { ...data, updatedAt: serverNow() });
    auditInTx(tx, actor, {
      action: "team.update",
      entityType: "team",
      entityId: teamId,
      teamId,
      summary: `עודכן צוות "${data.name}"`,
      before,
      after: data,
    });
  });
}

/**
 * Sets exactly which teams a user manages. Used from the user form.
 * Must be called after all reads of the transaction (it only writes).
 */
export function setManagedTeamsInTx(
  tx: Transaction,
  userId: string,
  current: string[],
  next: string[],
) {
  for (const teamId of current.filter((t) => !next.includes(t))) {
    tx.update(col(COLLECTIONS.teams).doc(teamId), {
      managerIds: FieldValue.arrayRemove(userId),
      updatedAt: serverNow(),
    });
  }
  for (const teamId of next.filter((t) => !current.includes(t))) {
    tx.update(col(COLLECTIONS.teams).doc(teamId), {
      managerIds: FieldValue.arrayUnion(userId),
      updatedAt: serverNow(),
    });
  }
}

/** The company's lines of business. Created by bootstrap/seed when there are no teams yet. */
export const DEFAULT_TEAM_NAMES = [
  "רנו",
  "ניסאן",
  "דאצ׳יה",
  "צ׳רי",
  "אקספנג",
  "רכב משומש",
  "ליסינג",
  "השכרה",
  "דיגיטל",
];

export async function ensureDefaultTeams(): Promise<Team[]> {
  const existing = await col(COLLECTIONS.teams).limit(1).get();
  if (existing.empty) {
    const batch = db().batch();
    DEFAULT_TEAM_NAMES.forEach((name, i) => {
      batch.set(col(COLLECTIONS.teams).doc(), {
        name,
        isActive: true,
        managerIds: [],
        sortOrder: i + 1,
        createdAt: serverNow(),
        updatedAt: serverNow(),
      });
    });
    await batch.commit();
  }
  const snap = await col(COLLECTIONS.teams).get();
  return snap.docs.map((d) => fromDoc<Team>(d));
}

// Activities: groups of teams (lines of business) that can be viewed together.

export const listActivities = cache(async (): Promise<Activity[]> => {
  const snap = await col(COLLECTIONS.activities).get();
  return (
    snap.docs
      .map((d) => fromDoc<Activity>(d))
      // Activities saved before seat counts existed have none.
      .map((a) => ({ ...a, seats: a.seats ?? null }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "he"))
  );
});

export const activityInputSchema = z.object({
  name: z.string().trim().min(2, "שם פעילות קצר מדי").max(40),
  sortOrder: z.coerce.number().int().default(0),
  seats: z.coerce.number().int().min(1, "לפחות עמדה אחת").max(10000).nullable().default(null),
});
export type ActivityInput = z.input<typeof activityInputSchema>;

export async function saveActivity(actor: Actor, activityId: string | null, input: ActivityInput) {
  assertCan(actor, "teams.manage");
  const data = activityInputSchema.parse(input);
  const dup = await col(COLLECTIONS.activities).where("name", "==", data.name).get();
  if (dup.docs.some((d) => d.id !== activityId)) throw new DomainError("כבר קיימת פעילות בשם זה");
  const ref = activityId
    ? col(COLLECTIONS.activities).doc(activityId)
    : col(COLLECTIONS.activities).doc();
  await db().runTransaction(async (tx) => {
    const before = activityId ? fromDocOrNull<Activity>(await tx.get(ref)) : null;
    if (activityId && !before) throw new NotFoundError("הפעילות לא נמצאה");
    if (before) tx.update(ref, { ...data, updatedAt: serverNow() });
    else tx.set(ref, { ...data, createdAt: serverNow(), updatedAt: serverNow() });
    auditInTx(tx, actor, {
      action: before ? "activity.update" : "activity.create",
      entityType: "activity",
      entityId: ref.id,
      teamId: null,
      summary: before ? `עודכנה פעילות "${data.name}"` : `נוצרה פעילות "${data.name}"`,
      before,
      after: data,
    });
  });
  return ref.id;
}

/** Deletes an activity; its teams stay, without an activity. */
export async function deleteActivity(actor: Actor, activityId: string) {
  assertCan(actor, "teams.manage");
  const ref = col(COLLECTIONS.activities).doc(activityId);
  await db().runTransaction(async (tx) => {
    const before = fromDocOrNull<Activity>(await tx.get(ref));
    if (!before) throw new NotFoundError("הפעילות לא נמצאה");
    const teams = await tx.get(col(COLLECTIONS.teams).where("activityId", "==", activityId));
    for (const t of teams.docs) tx.update(t.ref, { activityId: null, updatedAt: serverNow() });
    tx.delete(ref);
    auditInTx(tx, actor, {
      action: "activity.delete",
      entityType: "activity",
      entityId: activityId,
      teamId: null,
      summary: `נמחקה פעילות "${before.name}"${teams.size ? ` (${teams.size} צוותים נשארו ללא פעילות)` : ""}`,
      before,
      after: null,
    });
  });
}

/** The company's activities and their teams (by name). Digital belongs to none. */
export const DEFAULT_ACTIVITIES = [
  { name: "רכב חדש", seats: 18, teams: ["רנו", "ניסאן", "דאצ׳יה", "צ׳רי", "אקספנג"] },
  { name: "פסיפיק", seats: 28, teams: ["ליסינג", "רכב משומש", "השכרה"] },
];

/**
 * Creates the default activities when there are none yet, and puts the matching teams (by name)
 * that have no activity in them. Run after ensureDefaultTeams.
 * Existing default activities saved before seat counts existed get the default count once;
 * after that (a number or cleared) the admin's choice stands.
 */
export async function ensureDefaultActivities(): Promise<void> {
  const existing = await col(COLLECTIONS.activities).get();
  if (!existing.empty) {
    const batch = db().batch();
    let n = 0;
    for (const d of existing.docs) {
      const preset = DEFAULT_ACTIVITIES.find((a) => a.name === d.get("name"));
      if (preset && d.get("seats") === undefined) {
        batch.update(d.ref, { seats: preset.seats, updatedAt: serverNow() });
        n += 1;
      }
    }
    if (n > 0) await batch.commit();
    return;
  }
  const teams = await col(COLLECTIONS.teams).get();
  const batch = db().batch();
  DEFAULT_ACTIVITIES.forEach((activity, i) => {
    const ref = col(COLLECTIONS.activities).doc();
    batch.set(ref, {
      name: activity.name,
      sortOrder: i + 1,
      seats: activity.seats,
      createdAt: serverNow(),
      updatedAt: serverNow(),
    });
    for (const t of teams.docs) {
      const team = t.data() as Partial<Team>;
      if (!team.activityId && activity.teams.includes(team.name ?? "")) {
        batch.update(t.ref, { activityId: ref.id, updatedAt: serverNow() });
      }
    }
  });
  await batch.commit();
}
