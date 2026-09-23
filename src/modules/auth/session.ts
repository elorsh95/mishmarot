import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { adminAuth } from "@/lib/firebase/admin";
import { signInWithPassword } from "@/lib/firebase/auth-rest";
import { UnauthenticatedError } from "@/lib/errors";
import { audit } from "@/modules/audit/service";
import type { Actor } from "@/modules/permissions/check";
import { getRole } from "@/modules/roles/service";
import { managedTeamIds } from "@/modules/teams/service";
import { authEmailFor, findUserByUsername, getUser, markLoggedIn } from "@/modules/users/service";

export const SESSION_COOKIE = "__session";
const SESSION_DAYS = 5;

export interface SessionUser extends Actor {
  username: string;
  roleName: string;
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
  const [role, teamIds] = await Promise.all([getRole(user.roleId), managedTeamIds(uid)]);
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    roleId: user.roleId,
    roleName: role?.name ?? user.roleId,
    permissions: role?.permissions ?? {},
    managedTeamIds: teamIds,
  };
});

/** For pages and layouts: redirects to the login page when there is no session. */
export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/** For server actions: throws instead of redirecting. */
export async function requireActor(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new UnauthenticatedError();
  return user;
}

export type LoginResult = { ok: true } | { ok: false; error: string };

export async function login(username: string, password: string): Promise<LoginResult> {
  const invalid = { ok: false as const, error: "שם משתמש או סיסמה שגויים" };
  const user = await findUserByUsername(username);
  if (!user) return invalid;
  if (!user.isActive) return { ok: false, error: "המשתמש מושבת. יש לפנות למנהל המערכת" };

  const result = await signInWithPassword(authEmailFor(user.id), password);
  if (!result.ok) {
    if (result.reason === "too_many_attempts") {
      return { ok: false, error: "בוצעו יותר מדי ניסיונות. יש לנסות שוב בעוד כמה דקות" };
    }
    if (result.reason === "disabled") return { ok: false, error: "המשתמש מושבת" };
    if (result.reason === "unknown") return { ok: false, error: "שגיאה בהתחברות. נסו שוב" };
    return invalid;
  }

  const expiresIn = SESSION_DAYS * 24 * 60 * 60 * 1000;
  const sessionCookie = await adminAuth().createSessionCookie(result.idToken, { expiresIn });
  (await cookies()).set(SESSION_COOKIE, sessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: expiresIn / 1000,
  });
  await markLoggedIn(user.id);
  await audit(
    { id: user.id, fullName: user.fullName },
    { action: "auth.login", entityType: "auth", entityId: user.id, summary: "התחברות למערכת" },
  );
  return { ok: true };
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
}
