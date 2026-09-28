import "server-only";
import { notFound } from "next/navigation";
import type { Actor } from "@/modules/permissions/check";
import { logAccess } from "./service";

/** A page the user may not open: logged as refused access, then shown as not found. */
export async function deniedPage(
  user: Pick<Actor, "id" | "fullName">,
  page: string,
): Promise<never> {
  await logAccess(user, {
    action: "denied",
    resource: "page",
    detail: `ניסיון כניסה למסך ${page}`,
  });
  notFound();
}
