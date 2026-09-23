"use server";

import { z } from "zod";
import { runAction } from "@/lib/action";
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
