"use server";

import { z } from "zod";
import { runAction } from "@/lib/action";
import { createRole, deleteRole, roleInputSchema, updateRole } from "@/modules/roles/service";

const REVALIDATE = ["/roles", "/users"];
const id = z.string().min(1);

export async function saveRoleAction(roleId: string | null, input: unknown) {
  return runAction(
    async (actor) => {
      const data = roleInputSchema.parse(input);
      if (roleId) {
        await updateRole(actor, id.parse(roleId), data);
        return roleId;
      }
      return createRole(actor, data);
    },
    { revalidate: ["/"], message: roleId ? "התפקיד עודכן" : "התפקיד נוצר" },
  );
}

export async function deleteRoleAction(roleId: string) {
  return runAction((actor) => deleteRole(actor, id.parse(roleId)), {
    revalidate: REVALIDATE,
    message: "התפקיד נמחק",
  });
}
