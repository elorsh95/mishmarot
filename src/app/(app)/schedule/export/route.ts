import { logAccess } from "@/modules/access/service";
import type { NextRequest } from "next/server";
import { isIsoDate, todayIso, weekStartOf } from "@/lib/dates";
import { xlsxResponse } from "@/lib/xlsx-response";
import { getLogo } from "@/modules/branding/service";
import { getSessionUser } from "@/modules/auth/session";
import { getCatalog } from "@/modules/catalog/service";
import { weekScheduleXlsx } from "@/modules/reports/excel";
import { getWeekView } from "@/modules/schedule/service";
import { listActivities, teamsForActor } from "@/modules/teams/service";
import { resolveTeamSelection, selectionTeamIds } from "@/modules/teams/types";

/** Weekly schedule as Excel: ?team=<id>|all|act:<id>&week=YYYY-MM-DD. One sheet per team. */
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user || user.mfaSetupRequired) return new Response(null, { status: 401 });
  const params = request.nextUrl.searchParams;
  const [teams, activities] = await Promise.all([
    teamsForActor(user, "schedule.view"),
    listActivities(),
  ]);
  const selection = resolveTeamSelection(params.get("team"), teams, activities);
  if (!selection) return new Response(null, { status: 404 });
  const ids = selectionTeamIds(selection);
  const selected = teams.filter((t) => ids.includes(t.id));
  const weekParam = params.get("week") ?? "";
  const weekStart = weekStartOf(isIsoDate(weekParam) ? weekParam : todayIso());

  const [catalog, views] = await Promise.all([
    getCatalog(),
    Promise.all(selected.map((t) => getWeekView(user, t.id, weekStart))),
  ]);
  const label = selection.label;
  await logAccess(user, {
    action: "export",
    resource: "schedule",
    detail: `ייצוא הסידור לאקסל · ${label} · שבוע ${weekStart}`,
    teamId: selection.kind === "team" ? selection.team.id : null,
  });
  return xlsxResponse(
    await weekScheduleXlsx(views, catalog, (await getLogo())?.bytes ?? null),
    `סידור עבודה - ${label} ${weekStart}.xlsx`,
    `schedule-${weekStart}.xlsx`,
  );
}
