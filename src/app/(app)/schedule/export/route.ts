import type { NextRequest } from "next/server";
import { isIsoDate, todayIso, weekStartOf } from "@/lib/dates";
import { xlsxResponse } from "@/lib/xlsx-response";
import { getLogo } from "@/modules/branding/service";
import { getSessionUser } from "@/modules/auth/session";
import { getCatalog } from "@/modules/catalog/service";
import { weekScheduleXlsx } from "@/modules/reports/excel";
import { getWeekView } from "@/modules/schedule/service";
import { teamsForActor } from "@/modules/teams/service";

/** Weekly schedule as Excel: ?team=<id>|all&week=YYYY-MM-DD. One sheet per team. */
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return new Response(null, { status: 401 });
  const params = request.nextUrl.searchParams;
  const teams = await teamsForActor(user, "schedule.view");
  const teamParam = params.get("team") ?? "";
  const selected = teamParam === "all" ? teams : teams.filter((t) => t.id === teamParam);
  if (selected.length === 0) return new Response(null, { status: 404 });
  const weekParam = params.get("week") ?? "";
  const weekStart = weekStartOf(isIsoDate(weekParam) ? weekParam : todayIso());

  const [catalog, views] = await Promise.all([
    getCatalog(),
    Promise.all(selected.map((t) => getWeekView(user, t.id, weekStart))),
  ]);
  const label = teamParam === "all" ? "כל הצוותים" : selected[0].name;
  return xlsxResponse(
    await weekScheduleXlsx(views, catalog, (await getLogo())?.bytes ?? null),
    `סידור עבודה - ${label} ${weekStart}.xlsx`,
    `schedule-${weekStart}.xlsx`,
  );
}
