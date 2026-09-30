import { logAccess } from "@/modules/access/service";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatDateTime, formatDayMonth, isIsoDate, todayIso, weekStartOf } from "@/lib/dates";
import { getSessionUser, requireSessionUser } from "@/modules/auth/session";
import { getBranding } from "@/modules/branding/service";
import { logoUrl } from "@/modules/branding/types";
import { getCatalog } from "@/modules/catalog/service";
import { getWeekView } from "@/modules/schedule/service";
import { listActivities, teamsForActor } from "@/modules/teams/service";
import { resolveTeamSelection, selectionTeamIds } from "@/modules/teams/types";
import { PrintToolbar } from "./print-toolbar";
import { WeekSheet } from "./week-sheet";

/** The browser suggests the page title as the PDF file name. */
export async function generateMetadata({
  searchParams,
}: PageProps<"/print/schedule">): Promise<Metadata> {
  const params = await searchParams;
  const user = await getSessionUser();
  if (!user) return { title: "ייצוא סידור עבודה" };
  const week = typeof params.week === "string" && isIsoDate(params.week) ? params.week : "";
  const [teams, activities] = await Promise.all([
    teamsForActor(user, "schedule.view"),
    listActivities(),
  ]);
  const selection = resolveTeamSelection(
    typeof params.team === "string" ? params.team : null,
    teams,
    activities,
  );
  return { title: { absolute: `סידור עבודה - ${selection?.label ?? ""} ${week}`.trim() } };
}

/**
 * Print-optimized weekly schedule (A4 landscape). The browser's "Save as PDF" produces the file,
 * which renders Hebrew/RTL correctly without a server-side PDF engine.
 * ?team=<id> for one team, ?team=all for every team the user can view, ?team=act:<id> for an
 * activity's teams (one page per team).
 */
export default async function PrintSchedulePage({ searchParams }: PageProps<"/print/schedule">) {
  const user = await requireSessionUser();
  const params = await searchParams;
  const [teams, activities] = await Promise.all([
    teamsForActor(user, "schedule.view"),
    listActivities(),
  ]);
  const selection = resolveTeamSelection(
    typeof params.team === "string" ? params.team : null,
    teams,
    activities,
  );
  if (!selection) notFound();
  const ids = selectionTeamIds(selection);
  const selected = teams.filter((t) => ids.includes(t.id));

  const weekParam = typeof params.week === "string" && isIsoDate(params.week) ? params.week : null;
  const weekStart = weekStartOf(weekParam ?? todayIso());

  const [catalog, branding, views] = await Promise.all([
    getCatalog(),
    getBranding(),
    Promise.all(selected.map((t) => getWeekView(user, t.id, weekStart))),
  ]);
  const printedAt = formatDateTime(new Date().toISOString());
  await logAccess(user, {
    action: "export",
    resource: "schedule",
    detail: `הדפסה/PDF של הסידור · ${selection.label} · שבוע ${formatDayMonth(weekStart)}`,
    teamId: selection.kind === "team" ? selection.team.id : null,
  });

  return (
    <div className="print-root min-h-screen bg-muted print:bg-white">
      <PrintToolbar />
      <div className="mx-auto max-w-[297mm] space-y-6 p-4 print:max-w-none print:space-y-0 print:p-0">
        {views.map((view) => (
          <WeekSheet
            key={view.team.id}
            view={view}
            catalog={catalog}
            printedAt={printedAt}
            printedBy={user.fullName}
            logoUrl={logoUrl(branding)}
          />
        ))}
      </div>
    </div>
  );
}
