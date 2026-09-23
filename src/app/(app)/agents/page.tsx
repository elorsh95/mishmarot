import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { requireSessionUser } from "@/modules/auth/session";
import { listAgents } from "@/modules/agents/service";
import { getCatalog } from "@/modules/catalog/service";
import { can, canForTeam } from "@/modules/permissions/check";
import { getSettings } from "@/modules/settings/service";
import { teamsForActor } from "@/modules/teams/service";
import { AgentsView } from "./agents-view";

export const metadata: Metadata = { title: "נציגים" };

export default async function AgentsPage() {
  const user = await requireSessionUser();
  if (!can(user, "agents.view")) {
    return (
      <>
        <PageHeader title="נציגים" />
        <Card>
          <EmptyState title="אין לך הרשאה לצפות בנציגים" />
        </Card>
      </>
    );
  }
  const [agents, viewTeams, manageTeams, catalog, settings] = await Promise.all([
    listAgents(user, { includeInactive: true }),
    teamsForActor(user, "agents.view", { includeInactive: true }),
    teamsForActor(user, "agents.manage"),
    getCatalog(),
    getSettings(),
  ]);
  return (
    <>
      <PageHeader
        title="נציגים"
        description="הנציגים אינם משתמשים במערכת; מנהלי הצוותים משבצים אותם"
      />
      <AgentsView
        agents={agents}
        teams={viewTeams.map((t) => ({ id: t.id, name: t.name, isActive: t.isActive }))}
        manageTeamIds={manageTeams.map((t) => t.id)}
        quotaTeamIds={viewTeams
          .filter((t) => canForTeam(user, "agents.quota", t.id))
          .map((t) => t.id)}
        catalog={catalog}
        defaultQuota={settings.defaultMonthlyQuota}
        canRequestTransfer={can(user, "transfers.request")}
      />
    </>
  );
}
