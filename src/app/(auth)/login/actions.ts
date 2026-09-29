"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { completeMfaLogin, login, logout } from "@/modules/auth/session";

const schema = z.object({
  username: z.string().trim().min(1, "יש להזין שם משתמש"),
  password: z.string().min(1, "יש להזין סיסמה"),
});

export interface LoginState {
  error: string | null;
  /** The password was right; the code from the authenticator app is needed. */
  step: "password" | "code";
}

/** Both steps of the login form: the password, then (with 2FA) the code. */
export async function loginAction(prev: LoginState, formData: FormData): Promise<LoginState> {
  if (formData.has("code")) return mfaCodeAction(prev, formData);
  const parsed = schema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message, step: "password" };
  const result = await login(parsed.data.username, parsed.data.password);
  if (!result.ok) {
    if ("mfa" in result) return { error: null, step: "code" };
    return { error: result.error, step: "password" };
  }
  redirect("/");
}

async function mfaCodeAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return { error: "יש להזין את 6 הספרות מהאפליקציה", step: "code" };
  const result = await completeMfaLogin(code);
  if (!result.ok) {
    const error = "error" in result ? result.error : "שגיאה בהתחברות";
    return { error, step: result.restart ? "password" : "code" };
  }
  redirect("/");
}

export async function logoutAction() {
  await logout();
  redirect("/login");
}

/**
 * Called by the browser after the idle time with no activity. The browser then goes to the
 * login page itself: a redirect() here would reach it as a rejected promise.
 */
export async function idleLogoutAction() {
  await logout("idle");
}
