import { deniedPage } from "@/modules/access/pages";
import type { Metadata } from "next";
import { requireSessionUser } from "@/modules/auth/session";
import { can } from "@/modules/permissions/check";
import { listActivities, listAllTeams } from "@/modules/teams/service";
import { listActiveUsersBrief } from "@/modules/users/service";
import { TeamsManager } from "./teams-manager";

export const metadata: Metadata = { title: "צוותים" };

export default async function TeamsPage() {
  const user = await requireSessionUser();
  if (!can(user, "teams.manage")) await deniedPage(user, "צוותים");
  const [teams, activities, users] = await Promise.all([
    listAllTeams(),
    listActivities(),
    listActiveUsersBrief(),
  ]);
  return <TeamsManager teams={teams} activities={activities} users={users} />;
}
