import { FieldValue, type Transaction } from "firebase-admin/firestore";
import { cache } from "react";
import { z } from "zod";
import { db } from "@/lib/firebase/admin";
import { col, COLLECTIONS, fromDoc, fromDocOrNull, serverNow } from "@/lib/firebase/collections";
import { DomainError, NotFoundError } from "@/lib/errors";
import { auditInTx } from "@/modules/audit/service";
import type { PermissionKey } from "@/modules/permissions/catalog";
import { assertCan, teamScope, type Actor } from "@/modules/permissions/check";

export interface Team {
  id: string;
  name: string;
  isActive: boolean;
  managerIds: string[];
  sortOrder: number;
}

export const listAllTeams = cache(async (): Promise<Team[]> => {
  const snap = await col(COLLECTIONS.teams).get();
  return snap.docs
    .map((d) => fromDoc<Team>(d))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "he"));
});

export async function getTeam(id: string): Promise<Team | null> {
  return fromDocOrNull<Team>(await col(COLLECTIONS.teams).doc(id).get());
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
});
export type TeamInput = z.infer<typeof teamInputSchema>;

async function assertUniqueName(name: string, exceptId?: string) {
  const dup = await col(COLLECTIONS.teams).where("name", "==", name).get();
  if (dup.docs.some((d) => d.id !== exceptId)) throw new DomainError("כבר קיים צוות בשם זה");
}

export async function createTeam(actor: Actor, input: TeamInput) {
  assertCan(actor, "teams.manage");
  const data = teamInputSchema.parse(input);
  await assertUniqueName(data.name);
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
