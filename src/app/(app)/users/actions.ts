"use server";

import { z } from "zod";
import { runAction } from "@/lib/action";
import {
  createUserSchema,
  deleteUser,
  inviteUser,
  resetPassword,
  sendPasswordLink,
  updateUser,
  updateUserSchema,
} from "@/modules/users/service";

const REVALIDATE = ["/users", "/teams"];
const id = z.string().min(1);

export async function createUserAction(input: unknown) {
  return runAction(
    async (actor) => {
      const data = createUserSchema.parse(input);
      const { emailSent } = await inviteUser(actor, data);
      return { email: data.email, emailSent };
    },
    { revalidate: REVALIDATE },
  );
}

export async function updateUserAction(userId: string, input: unknown) {
  return runAction((actor) => updateUser(actor, id.parse(userId), updateUserSchema.parse(input)), {
    revalidate: REVALIDATE,
    message: "המשתמש עודכן",
  });
}

export async function sendPasswordLinkAction(userId: string) {
  return runAction((actor) => sendPasswordLink(actor, id.parse(userId)), {
    revalidate: ["/users"],
  });
}

export async function resetPasswordAction(userId: string, password: string) {
  return runAction((actor) => resetPassword(actor, id.parse(userId), password), {
    revalidate: ["/users"],
    message: "הסיסמה אופסה. המשתמש ינותק מכל המכשירים",
  });
}

export async function deleteUserAction(userId: string) {
  return runAction((actor) => deleteUser(actor, id.parse(userId)), {
    revalidate: REVALIDATE,
    message: "המשתמש נמחק",
  });
}
