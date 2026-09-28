import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { adminAuth } from "@/lib/firebase/admin";
import { signInWithPassword } from "@/lib/firebase/auth-rest";
import { DomainError, UnauthenticatedError } from "@/lib/errors";
import { audit } from "@/modules/audit/service";
import type { Actor } from "@/modules/permissions/check";
import { getRole } from "@/modules/roles/service";
import { managedTeamIds } from "@/modules/teams/service";
import {
  clearLoginFailures,
  createMfaChallenge,
  getSecuritySettings,
  lockedUntil,
  lockMessage,
  recordLoginFailure,
  recordUnknownUsername,
  verifyMfaChallenge,
} from "@/modules/security/service";
import { SESSION_HOURS } from "@/modules/security/types";
import {
  authEmailOf,
  findUserByUsername,
  getUser,
  markLoggedIn,
  type AppUser,
} from "@/modules/users/service";

export const SESSION_COOKIE = "__session";
/** The pending login while the user types the code from the authenticator app. */
const MFA_COOKIE = "__mfa";

export interface SessionUser extends Actor {
  username: string;
  roleName: string;
  mfaEnabled: boolean;
  /** 2FA is required and not set up yet: only the setup page is open to this user. */
  mfaSetupRequired: boolean;
  /** Minutes of inactivity before the browser logs out. */
  idleMinutes: number;
}

/** The logged-in user for this request, or null. Memoized per request. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const cookie = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!cookie) return null;
  let uid: string;
  try {
    // Revocation is enforced through the isActive flag below, which avoids a network call per request.
    uid = (await adminAuth().verifySessionCookie(cookie, false)).uid;
  } catch {
    return null;
  }
  const user = await getUser(uid);
  if (!user || !user.isActive) return null;
  const [role, teamIds, security] = await Promise.all([
    getRole(user.roleId),
    managedTeamIds(uid),
    getSecuritySettings(),
  ]);
  const mfaEnabled = user.mfaEnabled === true;
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    roleId: user.roleId,
    roleName: role?.name ?? user.roleId,
    permissions: role?.permissions ?? {},
    managedTeamIds: teamIds,
    mfaEnabled,
    mfaSetupRequired: security.mfa === "required" && !mfaEnabled,
    idleMinutes: security.idleMinutes,
  };
});

/**
 * For pages and layouts: redirects to the login page when there is no session, and to the
 * 2FA setup page when the organization requires 2FA and the user hasn't set it up.
 */
export async function requireSessionUser({
  allowMfaSetup = false,
}: { allowMfaSetup?: boolean } = {}): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.mfaSetupRequired && !allowMfaSetup) redirect("/setup-2fa");
  return user;
}

/** For server actions: throws instead of redirecting. */
export async function requireActor({
  allowMfaSetup = false,
}: { allowMfaSetup?: boolean } = {}): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new UnauthenticatedError();
  if (user.mfaSetupRequired && !allowMfaSetup) {
    throw new DomainError("יש להגדיר אימות דו-שלבי לפני שממשיכים");
  }
  return user;
}

export type LoginResult = { ok: true } | { ok: false; error: string } | { ok: false; mfa: true };

const cookieOptions = (maxAgeSeconds: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: maxAgeSeconds,
});

export async function login(username: string, password: string): Promise<LoginResult> {
  const invalid = { ok: false as const, error: "שם משתמש או סיסמה שגויים" };
  const disabled = { ok: false as const, error: "המשתמש מושבת. יש לפנות למנהל המערכת" };
  const user = await findUserByUsername(username);
  if (!user) {
    await recordUnknownUsername(username);
    return invalid;
  }
  const locked = lockedUntil(user);
  if (locked) return { ok: false, error: lockMessage(locked) };

  // The password is checked before revealing that an account is disabled.
  const result = await signInWithPassword(authEmailOf(user), password);
  if (!result.ok) {
    if (result.reason === "too_many_attempts") {
      return { ok: false, error: "בוצעו יותר מדי ניסיונות. יש לנסות שוב בעוד כמה דקות" };
    }
    if (result.reason === "disabled") return disabled;
    if (result.reason === "unknown") return { ok: false, error: "שגיאה בהתחברות. נסו שוב" };
    const lock = await recordLoginFailure(user.id, "password");
    return lock ? { ok: false, error: lockMessage(lock) } : invalid;
  }
  if (!user.isActive) return disabled;

  if (user.mfaEnabled) {
    const challenge = await createMfaChallenge(user.id, result.idToken);
    (await cookies()).set(MFA_COOKIE, challenge, cookieOptions(5 * 60));
    return { ok: false, mfa: true };
  }
  await startSession(user, result.idToken);
  return { ok: true };
}

/** Second step of a login with 2FA: the code from the authenticator app. */
export async function completeMfaLogin(code: string): Promise<LoginResult & { restart?: boolean }> {
  const store = await cookies();
  const challenge = store.get(MFA_COOKIE)?.value;
  const restart = {
    ok: false as const,
    error: "תם הזמן להזנת הקוד. יש להתחבר מחדש",
    restart: true,
  };
  if (!challenge) return restart;
  const result = await verifyMfaChallenge(challenge, code);
  if (!result.ok) {
    if (result.restart) store.delete(MFA_COOKIE);
    if (result.userId) {
      const lock = await recordLoginFailure(result.userId, "code");
      if (lock) {
        store.delete(MFA_COOKIE);
        return { ok: false, error: lockMessage(lock), restart: true };
      }
    }
    return { ok: false, error: result.error, restart: result.restart };
  }
  store.delete(MFA_COOKIE);
  const user = await getUser(result.userId);
  if (!user || !user.isActive) return { ok: false, error: "המשתמש מושבת. יש לפנות למנהל המערכת" };
  const locked = lockedUntil(user);
  if (locked) return { ok: false, error: lockMessage(locked), restart: true };
  await startSession(user, result.idToken);
  return { ok: true };
}

async function startSession(user: AppUser, idToken: string) {
  const expiresIn = SESSION_HOURS * 60 * 60 * 1000;
  const sessionCookie = await adminAuth().createSessionCookie(idToken, { expiresIn });
  (await cookies()).set(SESSION_COOKIE, sessionCookie, cookieOptions(expiresIn / 1000));
  await Promise.all([clearLoginFailures(user.id), markLoggedIn(user.id)]);
  await audit(
    { id: user.id, fullName: user.fullName },
    {
      action: "auth.login",
      entityType: "auth",
      entityId: user.id,
      summary: user.mfaEnabled ? "התחברות למערכת (עם אימות דו-שלבי)" : "התחברות למערכת",
    },
  );
}

export async function logout(reason?: "idle") {
  const user = await getSessionUser();
  (await cookies()).delete(SESSION_COOKIE);
  if (user) {
    await audit(user, {
      action: reason === "idle" ? "auth.idle_logout" : "auth.logout",
      entityType: "auth",
      entityId: user.id,
      summary: reason === "idle" ? "ניתוק אוטומטי אחרי זמן ללא פעילות" : "יציאה מהמערכת",
    });
  }
}
