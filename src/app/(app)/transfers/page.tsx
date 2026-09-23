import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { requireSessionUser } from "@/modules/auth/session";
import { can } from "@/modules/permissions/check";
import { listAllTeams, teamsForActor } from "@/modules/teams/service";
import { listTransferCandidates, listTransfers } from "@/modules/transfers/service";
import { TransfersView } from "./transfers-view";

export const metadata: Metadata = { title: "העברות נציגים" };

export default async function TransfersPage() {
  const user = await requireSessionUser();
  if (!can(user, "transfers.request") && !can(user, "transfers.decide")) {
    return (
      <>
        <PageHeader title="העברות נציגים" />
        <Card>
          <EmptyState title="אין לך הרשאה לצפות בהעברות" />
        </Card>
      </>
    );
  }
  const [transfers, candidates, myTeams, allTeams] = await Promise.all([
    listTransfers(user),
    listTransferCandidates(user),
    teamsForActor(user, "transfers.request"),
    listAllTeams(),
  ]);
  return (
    <>
      <PageHeader
        title="העברות נציגים"
        description="מנהל הצוות המקבל שולח בקשה, ומנהל הצוות הנוכחי של הנציג מאשר אותה"
      />
      <TransfersView
        {...transfers}
        candidates={candidates}
        myTeams={myTeams.map((t) => ({ id: t.id, name: t.name }))}
        teamNames={Object.fromEntries(allTeams.map((t) => [t.id, t.name]))}
        userId={user.id}
      />
    </>
  );
}
