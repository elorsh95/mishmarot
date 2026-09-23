"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { login, logout } from "@/modules/auth/session";

const schema = z.object({
  username: z.string().trim().min(1, "יש להזין שם משתמש"),
  password: z.string().min(1, "יש להזין סיסמה"),
});

export async function loginAction(
  _prev: { error: string | null },
  formData: FormData,
): Promise<{ error: string | null }> {
  const parsed = schema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const result = await login(parsed.data.username, parsed.data.password);
  if (!result.ok) return { error: result.error };
  redirect("/");
}

export async function logoutAction() {
  await logout();
  redirect("/login");
}
