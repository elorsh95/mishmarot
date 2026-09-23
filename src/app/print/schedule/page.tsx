import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isIsoDate, todayIso, weekStartOf, formatDateTime } from "@/lib/dates";
import { getSessionUser, requireSessionUser } from "@/modules/auth/session";
import { getCatalog } from "@/modules/catalog/service";
import { getWeekView } from "@/modules/schedule/service";
import { teamsForActor } from "@/modules/teams/service";
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
  if (params.team === "all") return { title: { absolute: `סידור עבודה - כל הצוותים ${week}` } };
  const team = (await teamsForActor(user, "schedule.view")).find((t) => t.id === params.team);
  return { title: { absolute: `סידור עבודה - ${team?.name ?? ""} ${week}`.trim() } };
}

/**
 * Print-optimized weekly schedule (A4 landscape). The browser's "Save as PDF" produces the file,
 * which renders Hebrew/RTL correctly without a server-side PDF engine.
 * ?team=<id> for one team, ?team=all for every team the user can view (one page per team).
 */
export default async function PrintSchedulePage({ searchParams }: PageProps<"/print/schedule">) {
  const user = await requireSessionUser();
  const params = await searchParams;
  const teams = await teamsForActor(user, "schedule.view");
  const teamParam = typeof params.team === "string" ? params.team : "";
  const selected = teamParam === "all" ? teams : teams.filter((t) => t.id === teamParam);
  if (selected.length === 0) notFound();

  const weekParam = typeof params.week === "string" && isIsoDate(params.week) ? params.week : null;
  const weekStart = weekStartOf(weekParam ?? todayIso());

  const [catalog, views] = await Promise.all([
    getCatalog(),
    Promise.all(selected.map((t) => getWeekView(user, t.id, weekStart))),
  ]);
  const printedAt = formatDateTime(new Date().toISOString());

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
          />
        ))}
      </div>
    </div>
  );
}
