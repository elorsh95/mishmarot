import { z } from "zod";
import { adminAuth, db } from "@/lib/firebase/admin";
import { signInWithPassword } from "@/lib/firebase/auth-rest";
import { col, COLLECTIONS, fromDoc, fromDocOrNull, serverNow } from "@/lib/firebase/collections";
import { DomainError, NotFoundError } from "@/lib/errors";
import { auditInTx } from "@/modules/audit/service";
import { assertCan, type Actor } from "@/modules/permissions/check";
import { getRole } from "@/modules/roles/service";
import { listAllTeams, setManagedTeamsInTx } from "@/modules/teams/service";

export interface AppUser {
  id: string;
  username: string;
  usernameLower: string;
  fullName: string;
  roleId: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

/**
 * Firebase Auth identifies users by email. Users here log in with a username, so each user
 * gets a fixed internal address derived from its id (usernames can change freely).
 */
export function authEmailFor(userId: string) {
  return `${userId}@users.mishmarot.local`;
}

const usernameSchema = z
  .string()
  .trim()
  .min(3, "שם משתמש חייב להכיל לפחות 3 תווים")
  .max(30)
  .regex(/^[a-zA-Z0-9._-]+$/, "שם משתמש יכול להכיל אותיות באנגלית, ספרות, נקודה, מקף וקו תחתון");

export const passwordSchema = z
  .string()
  .min(8, "סיסמה חייבת להכיל לפחות 8 תווים")
  .max(100)
  .regex(/[a-zA-Z]/, "סיסמה חייבת להכיל לפחות אות אחת")
  .regex(/\d/, "סיסמה חייבת להכיל לפחות ספרה אחת");

export const createUserSchema = z.object({
  username: usernameSchema,
  fullName: z.string().trim().min(2, "יש להזין שם מלא").max(60),
  password: passwordSchema,
  roleId: z.string().min(1, "יש לבחור תפקיד"),
  managedTeamIds: z.array(z.string()).default([]),
});

export const updateUserSchema = createUserSchema.omit({ password: true }).extend({
  isActive: z.boolean(),
});

export async function getUser(id: string): Promise<AppUser | null> {
  return fromDocOrNull<AppUser>(await col(COLLECTIONS.users).doc(id).get());
}

export async function findUserByUsername(username: string): Promise<AppUser | null> {
  const snap = await col(COLLECTIONS.users)
    .where("usernameLower", "==", username.trim().toLowerCase())
    .limit(1)
    .get();
  return snap.empty ? null : fromDoc<AppUser>(snap.docs[0]);
}

export interface UserListItem extends AppUser {
  roleName: string;
  managedTeamIds: string[];
}

export async function listUsers(actor: Actor): Promise<UserListItem[]> {
  assertCan(actor, "users.manage");
  const [snap, rolesSnap, teams] = await Promise.all([
    col(COLLECTIONS.users).get(),
    col(COLLECTIONS.roles).get(),
    listAllTeams(),
  ]);
  const roleNames = new Map(rolesSnap.docs.map((d) => [d.id, String(d.get("name"))]));
  return snap.docs
    .map((d) => fromDoc<AppUser>(d))
    .map((u) => ({
      ...u,
      roleName: roleNames.get(u.roleId) ?? u.roleId,
      managedTeamIds: teams.filter((t) => t.managerIds.includes(u.id)).map((t) => t.id),
    }))
    .sort(
      (a, b) =>
        Number(b.isActive) - Number(a.isActive) || a.fullName.localeCompare(b.fullName, "he"),
    );
}

/** Users that can be picked as team managers. */
export async function listActiveUsersBrief(): Promise<Array<{ id: string; fullName: string }>> {
  const snap = await col(COLLECTIONS.users).where("isActive", "==", true).get();
  return snap.docs
    .map((d) => ({ id: d.id, fullName: String(d.get("fullName")) }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName, "he"));
}

async function assertUsernameFree(username: string, exceptId?: string) {
  const existing = await findUserByUsername(username);
  if (existing && existing.id !== exceptId) throw new DomainError("שם המשתמש כבר קיים במערכת");
}

async function assertRoleExists(roleId: string) {
  if (!(await getRole(roleId))) throw new DomainError("התפקיד שנבחר לא קיים");
}

/** Creates a user without an acting user (bootstrap/seed). */
export async function createUserUnchecked(
  input: z.infer<typeof createUserSchema>,
  actor: Actor | null = null,
): Promise<string> {
  const data = createUserSchema.parse(input);
  await assertUsernameFree(data.username);
  await assertRoleExists(data.roleId);
  const ref = col(COLLECTIONS.users).doc();
  await adminAuth().createUser({
    uid: ref.id,
    email: authEmailFor(ref.id),
    password: data.password,
    displayName: data.fullName,
  });
  try {
    await db().runTransaction(async (tx) => {
      const user = {
        username: data.username,
        usernameLower: data.username.toLowerCase(),
        fullName: data.fullName,
        roleId: data.roleId,
        isActive: true,
        lastLoginAt: null,
      };
      tx.set(ref, { ...user, createdAt: serverNow(), updatedAt: serverNow() });
      setManagedTeamsInTx(tx, ref.id, [], data.managedTeamIds);
      auditInTx(tx, actor, {
        action: "user.create",
        entityType: "user",
        entityId: ref.id,
        summary: `נוצר משתמש "${data.fullName}" (${data.username})`,
        after: { ...user, managedTeamIds: data.managedTeamIds },
      });
    });
  } catch (err) {
    await adminAuth().deleteUser(ref.id);
    throw err;
  }
  return ref.id;
}

export async function createUser(actor: Actor, input: z.infer<typeof createUserSchema>) {
  assertCan(actor, "users.manage");
  return createUserUnchecked(input, actor);
}

export async function updateUser(
  actor: Actor,
  userId: string,
  input: z.infer<typeof updateUserSchema>,
) {
  assertCan(actor, "users.manage");
  const data = updateUserSchema.parse(input);
  if (userId === actor.id && !data.isActive) throw new DomainError("לא ניתן להשבית את המשתמש שלך");
  if (userId === actor.id && data.roleId !== actor.roleId) {
    throw new DomainError("לא ניתן לשנות את התפקיד של המשתמש שלך");
  }
  await assertUsernameFree(data.username, userId);
  await assertRoleExists(data.roleId);
  const ref = col(COLLECTIONS.users).doc(userId);
  const teams = await listAllTeams();
  const currentTeams = teams.filter((t) => t.managerIds.includes(userId)).map((t) => t.id);

  let deactivated = false;
  await db().runTransaction(async (tx) => {
    const before = fromDocOrNull<AppUser>(await tx.get(ref));
    if (!before) throw new NotFoundError("המשתמש לא נמצא");
    const after = {
      username: data.username,
      usernameLower: data.username.toLowerCase(),
      fullName: data.fullName,
      roleId: data.roleId,
      isActive: data.isActive,
    };
    deactivated = before.isActive && !data.isActive;
    tx.update(ref, { ...after, updatedAt: serverNow() });
    setManagedTeamsInTx(tx, userId, currentTeams, data.managedTeamIds);
    auditInTx(tx, actor, {
      action: deactivated ? "user.deactivate" : "user.update",
      entityType: "user",
      entityId: userId,
      summary: deactivated ? `הושבת משתמש "${data.fullName}"` : `עודכן משתמש "${data.fullName}"`,
      before: {
        username: before.username,
        fullName: before.fullName,
        roleId: before.roleId,
        isActive: before.isActive,
        managedTeamIds: currentTeams,
      },
      after: { ...after, managedTeamIds: data.managedTeamIds },
    });
  });

  await adminAuth().updateUser(userId, { disabled: !data.isActive, displayName: data.fullName });
  if (deactivated) await adminAuth().revokeRefreshTokens(userId);
}

export async function resetPassword(actor: Actor, userId: string, password: string) {
  assertCan(actor, "users.manage");
  const pwd = passwordSchema.parse(password);
  const user = await getUser(userId);
  if (!user) throw new NotFoundError("המשתמש לא נמצא");
  await adminAuth().updateUser(userId, { password: pwd });
  await adminAuth().revokeRefreshTokens(userId);
  await db().runTransaction(async (tx) => {
    auditInTx(tx, actor, {
      action: "user.resetPassword",
      entityType: "user",
      entityId: userId,
      summary: `אופסה סיסמה למשתמש "${user.fullName}"`,
    });
  });
}

export async function changeOwnPassword(
  actor: Actor,
  currentPassword: string,
  newPassword: string,
) {
  const pwd = passwordSchema.parse(newPassword);
  const check = await signInWithPassword(authEmailFor(actor.id), currentPassword);
  if (!check.ok) throw new DomainError("הסיסמה הנוכחית שגויה");
  await adminAuth().updateUser(actor.id, { password: pwd });
  await db().runTransaction(async (tx) => {
    auditInTx(tx, actor, {
      action: "user.changePassword",
      entityType: "user",
      entityId: actor.id,
      summary: "המשתמש שינה את הסיסמה שלו",
    });
  });
}

export async function markLoggedIn(userId: string) {
  await col(COLLECTIONS.users).doc(userId).update({ lastLoginAt: serverNow() });
}
