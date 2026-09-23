import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireSessionUser } from "@/modules/auth/session";
import { can } from "@/modules/permissions/check";
import { listRoles } from "@/modules/roles/service";
import { listAllTeams } from "@/modules/teams/service";
import { listUsers } from "@/modules/users/service";
import { UsersManager } from "./users-manager";

export const metadata: Metadata = { title: "משתמשים" };

export default async function UsersPage() {
  const user = await requireSessionUser();
  if (!can(user, "users.manage")) notFound();
  const [users, roles, teams] = await Promise.all([listUsers(user), listRoles(), listAllTeams()]);
  return (
    <UsersManager
      users={users}
      roles={roles.map((r) => ({ id: r.id, name: r.name }))}
      teams={teams.map((t) => ({ id: t.id, name: t.name, isActive: t.isActive }))}
      currentUserId={user.id}
    />
  );
}
