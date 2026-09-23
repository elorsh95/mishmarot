/**
 * Password sign-in via the Identity Toolkit REST API, called from the server.
 * The Admin SDK cannot verify passwords, so we exchange credentials for an ID token here
 * and then mint a session cookie from it.
 */

function apiKey(): string {
  if (process.env.FIREBASE_API_KEY) return process.env.FIREBASE_API_KEY;
  const webConfig = process.env.FIREBASE_WEBAPP_CONFIG;
  if (webConfig) {
    const parsed = JSON.parse(webConfig) as { apiKey?: string };
    if (parsed.apiKey) return parsed.apiKey;
  }
  throw new Error("FIREBASE_API_KEY is not configured");
}

function baseUrl(): string {
  const emulator = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  return emulator
    ? `http://${emulator}/identitytoolkit.googleapis.com/v1`
    : "https://identitytoolkit.googleapis.com/v1";
}

export type PasswordSignInResult =
  | { ok: true; idToken: string; uid: string }
  | { ok: false; reason: "invalid_credentials" | "too_many_attempts" | "disabled" | "unknown" };

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<PasswordSignInResult> {
  const res = await fetch(`${baseUrl()}/accounts:signInWithPassword?key=${apiKey()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
    cache: "no-store",
  });
  const body = (await res.json()) as {
    idToken?: string;
    localId?: string;
    error?: { message?: string };
  };
  if (res.ok && body.idToken && body.localId) {
    return { ok: true, idToken: body.idToken, uid: body.localId };
  }
  const message = body.error?.message ?? "";
  if (message.startsWith("TOO_MANY_ATTEMPTS")) return { ok: false, reason: "too_many_attempts" };
  if (message.startsWith("USER_DISABLED")) return { ok: false, reason: "disabled" };
  if (
    message.startsWith("INVALID_LOGIN_CREDENTIALS") ||
    message.startsWith("INVALID_PASSWORD") ||
    message.startsWith("EMAIL_NOT_FOUND")
  ) {
    return { ok: false, reason: "invalid_credentials" };
  }
  console.error("signInWithPassword failed", res.status, message);
  return { ok: false, reason: "unknown" };
}

async function identityToolkit<T>(
  path: string,
  body: object,
  headers: Record<string, string> = {},
): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  const res = await fetch(`${baseUrl()}/${path}?key=${apiKey()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = (await res.json()) as T & { error?: { message?: string } };
  if (res.ok) return { ok: true, data };
  return { ok: false, message: data.error?.message ?? `HTTP ${res.status}` };
}

/**
 * Has Firebase e-mail a "set your password" link (the password-reset template, in Hebrew).
 * Used both for invitations and for "forgot password". Links are valid for one hour.
 */
export async function sendPasswordSetupEmail(email: string): Promise<boolean> {
  const result = await identityToolkit(
    "accounts:sendOobCode",
    { requestType: "PASSWORD_RESET", email },
    { "X-Firebase-Locale": "he" },
  );
  if (!result.ok) console.error("sendOobCode failed", result.message);
  return result.ok;
}

export type ResetCodeResult =
  | { ok: true; email: string }
  | { ok: false; reason: "expired" | "invalid" | "weak_password" | "unknown" };

function resetFailure(message: string): ResetCodeResult {
  if (message.startsWith("EXPIRED_OOB_CODE")) return { ok: false, reason: "expired" };
  if (message.startsWith("INVALID_OOB_CODE")) return { ok: false, reason: "invalid" };
  if (message.startsWith("WEAK_PASSWORD")) return { ok: false, reason: "weak_password" };
  console.error("resetPassword failed", message);
  return { ok: false, reason: "unknown" };
}

/** Checks a password-reset code without using it. */
export async function verifyPasswordResetCode(oobCode: string): Promise<ResetCodeResult> {
  const result = await identityToolkit<{ email: string }>("accounts:resetPassword", { oobCode });
  return result.ok ? { ok: true, email: result.data.email } : resetFailure(result.message);
}

/** Uses a password-reset code to set the new password. */
export async function confirmPasswordReset(
  oobCode: string,
  newPassword: string,
): Promise<ResetCodeResult> {
  const result = await identityToolkit<{ email: string }>("accounts:resetPassword", {
    oobCode,
    newPassword,
  });
  return result.ok ? { ok: true, email: result.data.email } : resetFailure(result.message);
}
