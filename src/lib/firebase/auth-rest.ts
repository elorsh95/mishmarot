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
