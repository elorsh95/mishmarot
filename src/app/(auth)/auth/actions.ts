"use server";

import { redirect } from "next/navigation";
import { z, ZodError } from "zod";
import { DomainError } from "@/lib/errors";
import { login } from "@/modules/auth/session";
import { completePasswordSetup, requestPasswordReset } from "@/modules/users/service";

export async function setPasswordAction(
  _prev: { error: string | null },
  formData: FormData,
): Promise<{ error: string | null }> {
  const oobCode = String(formData.get("oobCode") ?? "");
  const password = String(formData.get("password") ?? "");
  if (password !== String(formData.get("confirm") ?? "")) {
    return { error: "הסיסמאות אינן תואמות" };
  }
  let credentials: { username: string; password: string };
  try {
    credentials = await completePasswordSetup(oobCode, password);
  } catch (err) {
    if (err instanceof ZodError) return { error: err.issues[0].message };
    if (err instanceof DomainError) return { error: err.message };
    console.error("completePasswordSetup failed", err);
    return { error: "אירעה שגיאה. נסו שוב" };
  }
  const result = await login(credentials.username, credentials.password);
  redirect(result.ok ? "/" : "/login");
}

export async function forgotPasswordAction(
  _prev: { sent: boolean; error: string | null },
  formData: FormData,
): Promise<{ sent: boolean; error: string | null }> {
  const parsed = z
    .string()
    .trim()
    .min(1, "יש להזין שם משתמש או מייל")
    .max(120)
    .safeParse(formData.get("identifier"));
  if (!parsed.success) return { sent: false, error: parsed.error.issues[0].message };
  await requestPasswordReset(parsed.data);
  return { sent: true, error: null };
}
