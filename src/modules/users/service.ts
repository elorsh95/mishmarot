import { z } from "zod";
import { adminAuth, db } from "@/lib/firebase/admin";
import {
  confirmPasswordReset,
  sendPasswordSetupEmail,
  signInWithPassword,
  verifyPasswordResetCode,
} from "@/lib/firebase/auth-rest";
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
  /** Real e-mail, used for invitations and password resets. */
  email: string | null;
  /** The address Firebase Auth knows the user by (the real e-mail, or an internal one). */
  authEmail: string | null;
  /** null until the user sets a password through the invitation link. */
  passwordSetAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

/**
 * Users log in with a username. Firebase Auth identifies them by e-mail: invited users by their
 * real address; users created without one (bootstrap) by an internal address derived from the id.
 */
export function authEmailFor(userId: string) {
  return `${userId}@users.mishmarot.local`;
}

export function authEmailOf(user: Pick<AppUser, "id" | "authEmail">) {
  return user.authEmail ?? authEmailFor(user.id);
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

const emailSchema = z.string().trim().toLowerCase().email("כתובת מייל לא תקינה").max(120);

/** New users get an e-mail invitation and choose their own password. */
export const createUserSchema = z.object({
  username: usernameSchema,
  fullName: z.string().trim().min(2, "יש להזין שם מלא").max(60),
  email: emailSchema,
  roleId: z.string().min(1, "יש לבחור תפקיד"),
  managedTeamIds: z.array(z.string()).default([]),
});

/** Bootstrap/seed users: a password is given up front and the e-mail is optional. */
const directUserSchema = createUserSchema.extend({
  email: emailSchema.optional(),
  password: passwordSchema,
});

export const updateUserSchema = createUserSchema.extend({
  email: z.union([emailSchema, z.literal("")]).default(""),
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

function authErrorToDomain(err: unknown): never {
  const code = (err as { code?: string }).code;
  if (code === "auth/email-already-exists") {
    throw new DomainError("כתובת המייל כבר משויכת למשתמש אחר");
  }
  if (code === "auth/invalid-email") throw new DomainError("כתובת מייל לא תקינה");
  throw err;
}

async function insertUser(
  data: Omit<z.infer<typeof createUserSchema>, "email"> & { email?: string; password?: string },
  actor: Actor | null,
): Promise<string> {
  await assertUsernameFree(data.username);
  await assertRoleExists(data.roleId);
  const ref = col(COLLECTIONS.users).doc();
  const authEmail = data.email ?? authEmailFor(ref.id);
  await adminAuth()
    .createUser({
      uid: ref.id,
      email: authEmail,
      password: data.password,
      displayName: data.fullName,
    })
    .catch(authErrorToDomain);
  try {
    await db().runTransaction(async (tx) => {
      const user = {
        username: data.username,
        usernameLower: data.username.toLowerCase(),
        fullName: data.fullName,
        email: data.email ?? null,
        authEmail,
        roleId: data.roleId,
        isActive: true,
        lastLoginAt: null,
      };
      tx.set(ref, {
        ...user,
        passwordSetAt: data.password ? serverNow() : null,
        createdAt: serverNow(),
        updatedAt: serverNow(),
      });
      setManagedTeamsInTx(tx, ref.id, [], data.managedTeamIds);
      auditInTx(tx, actor, {
        action: "user.create",
        entityType: "user",
        entityId: ref.id,
        summary: data.password
          ? `נוצר משתמש "${data.fullName}" (${data.username})`
          : `נוצר משתמש "${data.fullName}" (${data.username}) ונשלחה הזמנה ל-${data.email}`,
        after: { ...user, managedTeamIds: data.managedTeamIds },
      });
    });
  } catch (err) {
    await adminAuth().deleteUser(ref.id);
    throw err;
  }
  return ref.id;
}

/** Creates a user with a known password, without an acting user (bootstrap/seed). */
export async function createUserUnchecked(
  input: z.input<typeof directUserSchema>,
  actor: Actor | null = null,
): Promise<string> {
  return insertUser(directUserSchema.parse(input), actor);
}

/** Creates a user and e-mails them a link to choose a password. */
export async function inviteUser(
  actor: Actor,
  input: z.input<typeof createUserSchema>,
): Promise<{ userId: string; emailSent: boolean }> {
  assertCan(actor, "users.manage");
  const data = createUserSchema.parse(input);
  const userId = await insertUser(data, actor);
  const emailSent = await sendPasswordSetupEmail(data.email);
  return { userId, emailSent };
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
  const current = await getUser(userId);
  if (!current) throw new NotFoundError("המשתמש לא נמצא");
  // An e-mail can be changed but not removed (it is the sign-in identity once set).
  const email = data.email || current.email;
  if (email && email !== current.email) {
    await adminAuth().updateUser(userId, { email, emailVerified: false }).catch(authErrorToDomain);
  }
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
      email: email ?? null,
      authEmail: email ?? authEmailOf(before),
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
        email: before.email ?? null,
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
    tx.update(col(COLLECTIONS.users).doc(userId), { passwordSetAt: serverNow() });
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
  const self = await getUser(actor.id);
  if (!self) throw new NotFoundError("המשתמש לא נמצא");
  const check = await signInWithPassword(authEmailOf(self), currentPassword);
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

/** Admin: (re)sends the invitation / password link to the user's e-mail. */
export async function sendPasswordLink(actor: Actor, userId: string) {
  assertCan(actor, "users.manage");
  const user = await getUser(userId);
  if (!user) throw new NotFoundError("המשתמש לא נמצא");
  if (!user.email) throw new DomainError("למשתמש אין כתובת מייל. יש להוסיף מייל בעריכת המשתמש");
  if (!user.isActive) throw new DomainError("המשתמש מושבת");
  if (!(await sendPasswordSetupEmail(user.email))) {
    throw new DomainError("שליחת המייל נכשלה. נסו שוב בעוד כמה דקות");
  }
  await db().runTransaction(async (tx) => {
    auditInTx(tx, actor, {
      action: user.passwordSetAt ? "user.sendResetLink" : "user.resendInvite",
      entityType: "user",
      entityId: userId,
      summary: `${user.passwordSetAt ? "נשלח קישור לאיפוס סיסמה" : "נשלחה הזמנה מחדש"} ל-${user.fullName} (${user.email})`,
    });
  });
  return user.email;
}

/**
 * Public "forgot password": sends a link if the username (or e-mail) belongs to an active user
 * with an e-mail. Always succeeds silently so it can't be used to discover accounts.
 */
export async function requestPasswordReset(identifier: string) {
  const value = identifier.trim().toLowerCase();
  if (!value) return;
  let user = await findUserByUsername(value);
  if (!user && value.includes("@")) {
    const snap = await col(COLLECTIONS.users).where("email", "==", value).limit(1).get();
    user = snap.empty ? null : fromDoc<AppUser>(snap.docs[0]);
  }
  if (!user || !user.isActive || !user.email) return;
  await sendPasswordSetupEmail(user.email);
}

async function findUserByAuthEmail(authEmail: string): Promise<AppUser | null> {
  const snap = await col(COLLECTIONS.users)
    .where("authEmail", "==", authEmail.toLowerCase())
    .limit(1)
    .get();
  return snap.empty ? null : fromDoc<AppUser>(snap.docs[0]);
}

export type PasswordLinkCheck =
  | { ok: true; user: Pick<AppUser, "fullName" | "username">; isInvite: boolean }
  | { ok: false; reason: "expired" | "invalid" };

/** Checks the link before showing the "choose a password" form. */
export async function checkPasswordLink(oobCode: string): Promise<PasswordLinkCheck> {
  const result = await verifyPasswordResetCode(oobCode);
  if (!result.ok) return { ok: false, reason: result.reason === "expired" ? "expired" : "invalid" };
  const user = await findUserByAuthEmail(result.email);
  if (!user || !user.isActive) return { ok: false, reason: "invalid" };
  return {
    ok: true,
    user: { fullName: user.fullName, username: user.username },
    isInvite: !user.passwordSetAt,
  };
}

/** Sets the password from an invitation/reset link. Returns what's needed to sign in. */
export async function completePasswordSetup(oobCode: string, password: string) {
  const pwd = passwordSchema.parse(password);
  const check = await verifyPasswordResetCode(oobCode);
  if (!check.ok) {
    throw new DomainError(
      check.reason === "expired"
        ? "תוקף הקישור פג. אפשר לבקש קישור חדש"
        : "הקישור אינו תקין או שכבר נעשה בו שימוש",
    );
  }
  const user = await findUserByAuthEmail(check.email);
  if (!user || !user.isActive) throw new DomainError("המשתמש לא נמצא או מושבת");

  const result = await confirmPasswordReset(oobCode, pwd);
  if (!result.ok) {
    if (result.reason === "weak_password") throw new DomainError("הסיסמה חלשה מדי");
    throw new DomainError("לא ניתן לקבוע סיסמה עם הקישור הזה. בקשו קישור חדש");
  }
  // Clicking the e-mailed link proves the address.
  await adminAuth().updateUser(user.id, { emailVerified: true });
  await db().runTransaction(async (tx) => {
    tx.update(col(COLLECTIONS.users).doc(user.id), {
      passwordSetAt: serverNow(),
      updatedAt: serverNow(),
    });
    auditInTx(
      tx,
      { id: user.id, fullName: user.fullName },
      {
        action: user.passwordSetAt ? "user.passwordReset" : "user.activate",
        entityType: "user",
        entityId: user.id,
        summary: user.passwordSetAt
          ? "המשתמש קבע סיסמה חדשה דרך קישור במייל"
          : "המשתמש השלים את ההרשמה וקבע סיסמה",
      },
    );
  });
  return { username: user.username, password: pwd };
}
