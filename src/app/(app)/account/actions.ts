"use server";

import { z } from "zod";
import { runAction } from "@/lib/action";
import {
  confirmMfaEnrollment,
  disableOwnMfa,
  startMfaEnrollment,
} from "@/modules/security/service";
import { changeOwnPassword } from "@/modules/users/service";

const schema = z.object({
  currentPassword: z.string().min(1, "יש להזין את הסיסמה הנוכחית"),
  newPassword: z.string(),
});

export async function changePasswordAction(input: unknown) {
  return runAction(
    async (actor) => {
      const { currentPassword, newPassword } = schema.parse(input);
      await changeOwnPassword(actor, currentPassword, newPassword);
    },
    { revalidate: ["/account"], message: "הסיסמה עודכנה" },
  );
}

const codeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "יש להזין את 6 הספרות מהאפליקציה");

export async function startMfaAction() {
  return runAction((actor) => startMfaEnrollment(actor), {
    revalidate: ["/account"],
    allowMfaSetup: true,
  });
}

export async function confirmMfaAction(code: unknown) {
  return runAction((actor) => confirmMfaEnrollment(actor, codeSchema.parse(code)), {
    revalidate: ["/"],
    message: "אימות דו-שלבי הופעל",
    allowMfaSetup: true,
  });
}

export async function disableMfaAction(code: unknown) {
  return runAction((actor) => disableOwnMfa(actor, codeSchema.parse(code)), {
    revalidate: ["/account"],
    message: "אימות דו-שלבי כובה",
  });
}
