/** Login and session security settings (settings/security). Client-safe. */

export type MfaPolicy = "optional" | "required";

export interface SecuritySettings {
  /** Minutes without activity (mouse, keyboard, touch) before the user is logged out. */
  idleMinutes: number;
  /** Whether every user must set up two-step verification. */
  mfa: MfaPolicy;
}

export const DEFAULT_SECURITY: SecuritySettings = { idleMinutes: 30, mfa: "optional" };

export const IDLE_OPTIONS = [10, 15, 30, 60, 120, 240] as const;

export const MFA_POLICY_LABELS: Record<MfaPolicy, string> = {
  optional: "רשות: כל משתמש יכול להפעיל בחשבון שלו",
  required: "חובה: כל המשתמשים חייבים להגדיר אימות דו-שלבי",
};

/** Failed logins (password or code) allowed within the window before the account locks. */
export const LOCKOUT = { maxFailures: 5, windowMinutes: 15, lockMinutes: 15 } as const;

/** How long a login session lasts at most, even with activity. */
export const SESSION_HOURS = 12;

/** Whether a user is locked out at a moment, and until when. */
export function lockedUntil(
  user: { lockedUntil?: number | null },
  now: number = Date.now(),
): number | null {
  return user.lockedUntil && user.lockedUntil > now ? user.lockedUntil : null;
}
