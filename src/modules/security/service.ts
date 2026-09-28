import { randomBytes } from "node:crypto";
import QRCode from "qrcode";
import { z } from "zod";
import { db } from "@/lib/firebase/admin";
import { col, COLLECTIONS, fromDocOrNull, serverNow } from "@/lib/firebase/collections";
import { DomainError, NotFoundError } from "@/lib/errors";
import { RateLimiter } from "@/lib/rate-limit";
import { generateTotpSecret, totpUri, verifyTotp } from "@/lib/totp";
import { audit, auditInTx } from "@/modules/audit/service";
import { PERMISSION_KEYS, PERMISSIONS, type RolePermissions } from "@/modules/permissions/catalog";
import { assertCan, type Actor } from "@/modules/permissions/check";
import type { PermissionReview, ReviewRow } from "./review-types";
import { IDLE_FLAG_DAYS } from "./review-types";
import {
  DEFAULT_SECURITY,
  IDLE_OPTIONS,
  LOCKOUT,
  lockedUntil,
  type SecuritySettings,
} from "./types";

/**
 * Login security: account lockout after repeated failures, two-step verification with an
 * authenticator app (TOTP), and the idle-logout / 2FA policy. Every event is audited.
 */

const settingsRef = () => col(COLLECTIONS.settings).doc("security");
/** Secrets live apart from the user document, which is listed and sent to the users screen. */
const secretRef = (userId: string) => col(COLLECTIONS.userSecrets).doc(userId);

export const securitySettingsSchema = z.object({
  idleMinutes: z.coerce
    .number()
    .int()
    .refine((n) => (IDLE_OPTIONS as readonly number[]).includes(n), "ערך לא תקין")
    .default(DEFAULT_SECURITY.idleMinutes),
  mfa: z.enum(["optional", "required"]).default(DEFAULT_SECURITY.mfa),
});

/** Read on every request (via the session), so kept for a short while per server instance. */
let cached: { value: SecuritySettings; at: number } | null = null;
const CACHE_MS = 30_000;

export async function getSecuritySettings(): Promise<SecuritySettings> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  const data = (await settingsRef().get()).data() ?? {};
  const parsed = securitySettingsSchema.safeParse(data);
  const value = parsed.success ? parsed.data : DEFAULT_SECURITY;
  cached = { value, at: Date.now() };
  return value;
}

export async function updateSecuritySettings(
  actor: Actor,
  input: z.input<typeof securitySettingsSchema>,
) {
  assertCan(actor, "settings.manage");
  const next = securitySettingsSchema.parse(input);
  await db().runTransaction(async (tx) => {
    const before = (await tx.get(settingsRef())).data() ?? null;
    tx.set(settingsRef(), { ...next, updatedAt: serverNow(), updatedBy: actor.id });
    auditInTx(tx, actor, {
      action: "settings.security",
      entityType: "settings",
      entityId: "security",
      summary: "עודכנו הגדרות האבטחה",
      before: before ? { idleMinutes: before.idleMinutes, mfa: before.mfa } : null,
      after: next,
    });
  });
  cached = null;
}

// ---- Lockout ----

interface UserLockFields {
  fullName: string;
  failedLogins?: number;
  failedLoginsSince?: number | null;
  lockedUntil?: number | null;
}

/**
 * Records a failed password or code. Returns when the account is locked, if this failure
 * (the LOCKOUT.maxFailures-th within the window) locked it.
 */
export async function recordLoginFailure(
  userId: string,
  kind: "password" | "code",
  now: number = Date.now(),
): Promise<number | null> {
  const ref = col(COLLECTIONS.users).doc(userId);
  return db().runTransaction(async (tx) => {
    const user = fromDocOrNull<UserLockFields>(await tx.get(ref));
    if (!user) return null;
    const windowMs = LOCKOUT.windowMinutes * 60_000;
    const fresh = !user.failedLoginsSince || now - user.failedLoginsSince > windowMs;
    const count = (fresh ? 0 : (user.failedLogins ?? 0)) + 1;
    const lock = count >= LOCKOUT.maxFailures ? now + LOCKOUT.lockMinutes * 60_000 : null;
    tx.update(ref, {
      failedLogins: lock ? 0 : count,
      failedLoginsSince: lock ? null : fresh ? now : user.failedLoginsSince,
      ...(lock ? { lockedUntil: lock } : {}),
    });
    const who = { id: userId, fullName: user.fullName };
    auditInTx(tx, who, {
      action: "auth.failed",
      entityType: "auth",
      entityId: userId,
      summary: kind === "password" ? "ניסיון התחברות עם סיסמה שגויה" : "קוד אימות שגוי",
    });
    if (lock) {
      auditInTx(tx, who, {
        action: "auth.locked",
        entityType: "auth",
        entityId: userId,
        summary: `החשבון ננעל ל-${LOCKOUT.lockMinutes} דקות אחרי ${LOCKOUT.maxFailures} ניסיונות כושלים`,
      });
    }
    return lock;
  });
}

export async function clearLoginFailures(userId: string) {
  await col(COLLECTIONS.users)
    .doc(userId)
    .update({ failedLogins: 0, failedLoginsSince: null, lockedUntil: null });
}

/** Unknown usernames: logged, but at most a few per minute so the log can't be flooded. */
const unknownLimiter = new RateLimiter(10, 60_000, 1);

export async function recordUnknownUsername(username: string) {
  if (!unknownLimiter.allow("all")) return;
  await audit(null, {
    action: "auth.unknown_user",
    entityType: "auth",
    entityId: "unknown",
    summary: `ניסיון התחברות עם שם משתמש שלא קיים: ${username.slice(0, 40)}`,
  });
}

export async function unlockUser(actor: Actor, userId: string) {
  assertCan(actor, "users.manage");
  const ref = col(COLLECTIONS.users).doc(userId);
  await db().runTransaction(async (tx) => {
    const user = fromDocOrNull<UserLockFields>(await tx.get(ref));
    if (!user) throw new NotFoundError("המשתמש לא נמצא");
    tx.update(ref, { failedLogins: 0, failedLoginsSince: null, lockedUntil: null });
    auditInTx(tx, actor, {
      action: "auth.unlock",
      entityType: "user",
      entityId: userId,
      summary: `בוטלה הנעילה של ${user.fullName}`,
    });
  });
}

export function lockMessage(until: number, now: number = Date.now()) {
  const minutes = Math.max(1, Math.ceil((until - now) / 60_000));
  return `החשבון ננעל זמנית אחרי כמה ניסיונות כושלים. אפשר לנסות שוב בעוד ${minutes} דקות, או לפנות למנהל המערכת`;
}

export { lockedUntil };

// ---- Two-step verification (TOTP) ----

interface UserSecrets {
  mfaSecret?: string | null;
  mfaPendingSecret?: string | null;
  mfaLastStep?: number;
}

const ISSUER = "משמרות";

/** Starts setting up 2FA: a new secret, shown as a QR code, confirmed by the first code. */
export async function startMfaEnrollment(actor: Actor & { username?: string }) {
  const secret = generateTotpSecret();
  await secretRef(actor.id).set({ mfaPendingSecret: secret }, { merge: true });
  const uri = totpUri(secret, actor.username ?? actor.fullName, ISSUER);
  const qr = await QRCode.toDataURL(uri, { margin: 1, width: 220 });
  return { secret, qr };
}

export async function confirmMfaEnrollment(actor: Actor, code: string) {
  const ref = secretRef(actor.id);
  await db().runTransaction(async (tx) => {
    const secrets = fromDocOrNull<UserSecrets>(await tx.get(ref));
    const pending = secrets?.mfaPendingSecret;
    if (!pending) throw new DomainError("יש להתחיל את ההגדרה מחדש");
    const step = verifyTotp(pending, code);
    if (step === null) throw new DomainError("הקוד שגוי. בדקו שהשעה בטלפון מדויקת ונסו שוב");
    tx.set(ref, { mfaSecret: pending, mfaPendingSecret: null, mfaLastStep: step });
    tx.update(col(COLLECTIONS.users).doc(actor.id), {
      mfaEnabled: true,
      mfaEnabledAt: serverNow(),
    });
    auditInTx(tx, actor, {
      action: "auth.mfa_enabled",
      entityType: "auth",
      entityId: actor.id,
      summary: "הופעל אימות דו-שלבי",
    });
  });
}

/** Turns 2FA off for oneself (needs a current code), when the policy allows it. */
export async function disableOwnMfa(actor: Actor, code: string) {
  if ((await getSecuritySettings()).mfa === "required") {
    throw new DomainError("אימות דו-שלבי הוא חובה בארגון, ולא ניתן לכבות אותו");
  }
  const ref = secretRef(actor.id);
  await db().runTransaction(async (tx) => {
    const secrets = fromDocOrNull<UserSecrets>(await tx.get(ref));
    if (!secrets?.mfaSecret) throw new DomainError("אימות דו-שלבי לא מופעל");
    if (verifyTotp(secrets.mfaSecret, code, { lastStep: secrets.mfaLastStep }) === null) {
      throw new DomainError("הקוד שגוי");
    }
    tx.set(ref, { mfaSecret: null, mfaPendingSecret: null, mfaLastStep: -1 });
    tx.update(col(COLLECTIONS.users).doc(actor.id), { mfaEnabled: false, mfaEnabledAt: null });
    auditInTx(tx, actor, {
      action: "auth.mfa_disabled",
      entityType: "auth",
      entityId: actor.id,
      summary: "כובה אימות דו-שלבי",
    });
  });
}

/** An admin resets a user's 2FA (lost phone). The user sets it up again at the next login. */
export async function resetUserMfa(actor: Actor, userId: string) {
  assertCan(actor, "users.manage");
  const userRef = col(COLLECTIONS.users).doc(userId);
  await db().runTransaction(async (tx) => {
    const user = fromDocOrNull<{ fullName: string }>(await tx.get(userRef));
    if (!user) throw new NotFoundError("המשתמש לא נמצא");
    tx.set(secretRef(userId), { mfaSecret: null, mfaPendingSecret: null, mfaLastStep: -1 });
    tx.update(userRef, { mfaEnabled: false, mfaEnabledAt: null });
    auditInTx(tx, actor, {
      action: "auth.mfa_reset",
      entityType: "user",
      entityId: userId,
      summary: `אופס האימות הדו-שלבי של ${user.fullName}`,
    });
  });
}

// ---- Login challenge: the password was right, the code is still needed ----

const CHALLENGE_MINUTES = 5;
const CHALLENGE_ATTEMPTS = 5;

interface Challenge {
  userId: string;
  idToken: string;
  expiresAt: number;
  attempts: number;
}

export async function createMfaChallenge(userId: string, idToken: string): Promise<string> {
  const id = randomBytes(24).toString("base64url");
  await col(COLLECTIONS.mfaChallenges)
    .doc(id)
    .set({
      userId,
      idToken,
      expiresAt: Date.now() + CHALLENGE_MINUTES * 60_000,
      attempts: 0,
    } satisfies Challenge);
  return id;
}

export type ChallengeResult =
  | { ok: true; userId: string; idToken: string }
  | { ok: false; error: string; restart?: boolean; userId?: string };

/** Checks the code for a login challenge. The challenge is used up on success. */
export async function verifyMfaChallenge(id: string, code: string): Promise<ChallengeResult> {
  const ref = col(COLLECTIONS.mfaChallenges).doc(id);
  return db().runTransaction(async (tx): Promise<ChallengeResult> => {
    const challenge = fromDocOrNull<Challenge>(await tx.get(ref));
    const restart = {
      ok: false as const,
      error: "תם הזמן להזנת הקוד. יש להתחבר מחדש",
      restart: true,
    };
    if (!challenge || challenge.expiresAt < Date.now()) {
      if (challenge) tx.delete(ref);
      return restart;
    }
    const secretSnap = await tx.get(secretRef(challenge.userId));
    const secrets = fromDocOrNull<UserSecrets>(secretSnap);
    const step = secrets?.mfaSecret
      ? verifyTotp(secrets.mfaSecret, code, { lastStep: secrets.mfaLastStep })
      : null;
    if (step === null) {
      if (challenge.attempts + 1 >= CHALLENGE_ATTEMPTS) tx.delete(ref);
      else tx.update(ref, { attempts: challenge.attempts + 1 });
      return {
        ok: false,
        error: "הקוד שגוי",
        restart: challenge.attempts + 1 >= CHALLENGE_ATTEMPTS,
        userId: challenge.userId,
      };
    }
    tx.set(secretRef(challenge.userId), { mfaLastStep: step }, { merge: true });
    tx.delete(ref);
    return { ok: true, userId: challenge.userId, idToken: challenge.idToken };
  });
}

/** Active users who haven't set up 2FA, for the security settings screen. */
export async function countUsersWithoutMfa(actor: Actor): Promise<number> {
  assertCan(actor, "settings.manage");
  const snap = await col(COLLECTIONS.users).where("isActive", "==", true).get();
  return snap.docs.filter((d) => d.get("mfaEnabled") !== true).length;
}

// ---- Periodic permissions review ----

const reviewRef = () => col(COLLECTIONS.settings).doc("permissionReview");

const ADMIN_PERMISSIONS = ["users.manage", "roles.manage", "settings.manage"] as const;

/** Every user with their role's permissions and what needs attention, for the review. */
export async function permissionReview(actor: Actor): Promise<PermissionReview> {
  assertCan(actor, "users.manage");
  const [usersSnap, rolesSnap, teamsSnap, review] = await Promise.all([
    col(COLLECTIONS.users).get(),
    col(COLLECTIONS.roles).get(),
    col(COLLECTIONS.teams).get(),
    reviewRef().get(),
  ]);
  const roles = new Map(
    rolesSnap.docs.map((d) => [
      d.id,
      { name: String(d.get("name")), permissions: (d.get("permissions") ?? {}) as RolePermissions },
    ]),
  );
  const now = Date.now();
  const toIso = (v: unknown) =>
    v && typeof (v as { toDate?: () => Date }).toDate === "function"
      ? (v as { toDate: () => Date }).toDate().toISOString()
      : null;
  const rows: ReviewRow[] = usersSnap.docs.map((d) => {
    const role = roles.get(String(d.get("roleId")));
    const permissions = role?.permissions ?? {};
    const lastLoginAt = toIso(d.get("lastLoginAt"));
    const since = lastLoginAt ?? toIso(d.get("createdAt"));
    const idleDays = since ? Math.floor((now - Date.parse(since)) / 86_400_000) : 0;
    const isActive = d.get("isActive") === true;
    const mfaEnabled = d.get("mfaEnabled") === true;
    const flags: string[] = [];
    if (isActive && idleDays >= IDLE_FLAG_DAYS) {
      flags.push(
        lastLoginAt
          ? `לא התחבר/ה ${idleDays} ימים: לשקול השבתה`
          : `לא התחבר/ה מאז שנוצר/ה (${idleDays} ימים)`,
      );
    }
    if (isActive && !mfaEnabled && ADMIN_PERMISSIONS.some((p) => permissions[p])) {
      flags.push("הרשאות ניהול בלי אימות דו-שלבי");
    }
    if (isActive && !role) flags.push("התפקיד לא קיים");
    return {
      userId: d.id,
      fullName: String(d.get("fullName") ?? ""),
      username: String(d.get("username") ?? ""),
      roleName: role?.name ?? String(d.get("roleId")),
      isActive,
      mfaEnabled,
      lastLoginAt,
      idleDays,
      teams: teamsSnap.docs
        .filter((t) => ((t.get("managerIds") as string[] | undefined) ?? []).includes(d.id))
        .map((t) => String(t.get("name"))),
      permissions: PERMISSION_KEYS.filter((k) => permissions[k]).map((k) => ({
        label: PERMISSIONS[k].label,
        scope: permissions[k]!,
      })),
      flags,
    };
  });
  rows.sort(
    (a, b) =>
      Number(b.isActive) - Number(a.isActive) ||
      b.flags.length - a.flags.length ||
      a.fullName.localeCompare(b.fullName, "he"),
  );
  const r = review.data();
  return {
    rows,
    lastReview: r ? { at: toIso(r.at) ?? "", byName: String(r.byName ?? "") } : null,
  };
}

/** Records that an admin reviewed the users and their permissions. */
export async function markPermissionsReviewed(actor: Actor, note: string) {
  assertCan(actor, "users.manage");
  const text = z.string().trim().max(500).parse(note);
  await db().runTransaction(async (tx) => {
    tx.set(reviewRef(), { at: serverNow(), by: actor.id, byName: actor.fullName, note: text });
    auditInTx(tx, actor, {
      action: "permissions.review",
      entityType: "user",
      entityId: "review",
      summary: `בוצעה בדיקה תקופתית של המשתמשים וההרשאות${text ? `: ${text}` : ""}`,
    });
  });
}
