import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireSessionUser } from "@/modules/auth/session";
import { can } from "@/modules/permissions/check";
import { listRoles, permissionGroups } from "@/modules/roles/service";
import { RolesManager } from "./roles-manager";

export const metadata: Metadata = { title: "תפקידים והרשאות" };

export default async function RolesPage() {
  const user = await requireSessionUser();
  if (!can(user, "roles.manage")) notFound();
  const roles = await listRoles();
  return <RolesManager roles={roles} groups={permissionGroups()} />;
}
