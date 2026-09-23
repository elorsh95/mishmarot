import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { requireSessionUser } from "@/modules/auth/session";
import { listApprovals } from "@/modules/approvals/service";
import { getCatalog } from "@/modules/catalog/service";
import { can } from "@/modules/permissions/check";
import { teamsForActor } from "@/modules/teams/service";
import { ApprovalsView } from "./approvals-view";

export const metadata: Metadata = { title: "בקשות לאישור" };

export default async function ApprovalsPage({ searchParams }: PageProps<"/approvals">) {
  const user = await requireSessionUser();
  if (!can(user, "approvals.view") && !can(user, "approvals.decide")) {
    return (
      <>
        <PageHeader title="בקשות לאישור" />
        <Card>
          <EmptyState title="אין לך הרשאה לצפות בבקשות" />
        </Card>
      </>
    );
  }
  const params = await searchParams;
  const tab = params.tab === "decided" ? "decided" : "pending";
  const teamId = typeof params.team === "string" && params.team ? params.team : undefined;
  const month =
    typeof params.month === "string" && /^\d{4}-\d{2}$/.test(params.month)
      ? params.month
      : undefined;

  const [items, teams, catalog] = await Promise.all([
    listApprovals(user, { status: tab, teamId, month }),
    teamsForActor(user, "approvals.view", { includeInactive: true }),
    getCatalog(),
  ]);

  return (
    <>
      <PageHeader
        title="בקשות לאישור"
        description="שיבוצים במיקום הדורש מכסה (למשל עבודה מהבית) מעבר למכסה החודשית של הנציג"
      />
      <ApprovalsView
        items={items}
        tab={tab}
        teams={teams.map((t) => ({ id: t.id, name: t.name }))}
        teamId={teamId ?? ""}
        month={month ?? ""}
        catalog={catalog}
        canDecide={can(user, "approvals.decide")}
      />
    </>
  );
}
