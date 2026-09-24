import { Home } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDayMonth, formatMonth, WEEKDAY_NAMES, weekdayOf } from "@/lib/dates";
import { agentName } from "@/modules/agents/types";
import type { Catalog } from "@/modules/catalog/service";
import { shiftWeekday } from "@/modules/calendar/types";
import type { WeekView } from "@/modules/schedule/service";
import { assignmentId, type Assignment } from "@/modules/schedule/types";

const STATUS_TEXT: Partial<Record<Assignment["quotaStatus"], string>> = {
  pending: "ממתין לאישור",
  approved: "אושר",
  rejected: "נדחה",
};

/** One team's week on one A4 landscape page. Readable in color and in black and white. */
export function WeekSheet({
  view,
  catalog,
  printedAt,
  printedBy,
}: {
  view: WeekView;
  catalog: Catalog;
  printedAt: string;
  printedBy: string;
}) {
  const agents = view.agents.filter((a) => a.inTeam && (a.isActive || hasEntries(view, a.id)));
  const months = [...new Set(view.days.map((d) => d.slice(0, 7)))];

  return (
    <section className="sheet rounded-lg bg-white p-6 text-[11px] text-black shadow print:rounded-none print:p-0 print:shadow-none">
      <header className="mb-3 flex items-end justify-between gap-4 border-b-2 border-black pb-2">
        <div>
          <h1 className="text-xl font-bold">סידור עבודה – צוות {view.team.name}</h1>
          <p className="text-sm">שבוע {view.label}</p>
        </div>
        <div className="text-end text-[10px] leading-4 text-gray-600">
          <p>
            סטטוס:{" "}
            <strong className="text-black">
              {view.week.status === "published" ? "פורסם" : "טיוטה"}
            </strong>
          </p>
          <p>
            הופק ע״י {printedBy} · {printedAt}
          </p>
        </div>
      </header>

      {agents.length === 0 ? (
        <p className="py-8 text-center text-sm">אין נציגים בצוות</p>
      ) : (
        <table className="w-full table-fixed border-collapse">
          <thead>
            <tr>
              <th className="w-[17%] border border-gray-400 bg-gray-100 px-1.5 py-1 text-start">
                נציג
              </th>
              {view.days.map((d) => (
                <th key={d} className="border border-gray-400 bg-gray-100 px-1 py-1 text-center">
                  <div className="font-bold">{WEEKDAY_NAMES[weekdayOf(d)]}</div>
                  <div className="font-normal text-gray-600">{formatDayMonth(d)}</div>
                  {view.dayInfo[d]?.name || view.dayInfo[d]?.kind === "closed" ? (
                    <div className="text-[9px] font-semibold">
                      {view.dayInfo[d].name ?? "חג"}
                      {view.dayInfo[d].kind === "closed" ? " · סגור" : ""}
                      {view.dayInfo[d].kind === "eve" ? " · כמו שישי" : ""}
                    </div>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {agents.map((agent) => (
              <tr key={agent.id} className="break-inside-avoid">
                <th className="border border-gray-400 px-1.5 py-1 text-start align-middle font-normal">
                  <div className="font-semibold">{agentName(agent)}</div>
                  <div className="text-[9px] text-gray-600">
                    {agent.employeeNumber}
                    {view.quotaUsage[agent.id]
                      ?.filter((u) => months.includes(u.month))
                      .map((u, i) => (
                        <span
                          key={u.month}
                          className={agent.employeeNumber || i > 0 ? "ms-1.5" : ""}
                        >
                          {agent.employeeNumber || i > 0 ? "· " : ""}בית
                          {months.length > 1 ? ` ${formatMonth(u.month).split(" ")[0]}` : ""}:{" "}
                          <span dir="ltr">
                            {u.used}/{u.quota}
                          </span>
                        </span>
                      ))}
                  </div>
                </th>
                {view.days.map((date) => (
                  <td key={date} className="border border-gray-400 p-0.5 text-center align-middle">
                    <Cell
                      entry={view.assignments[assignmentId(agent.id, date)]}
                      catalog={catalog}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th className="border border-gray-400 bg-gray-100 px-1.5 py-1 text-start">
                סה״כ ביום
              </th>
              {view.days.map((date) => {
                const c = coverage(
                  view,
                  catalog,
                  date,
                  agents.map((a) => a.id),
                );
                return (
                  <td
                    key={date}
                    className="border border-gray-400 bg-gray-100 px-1 py-1 text-center text-[10px]"
                  >
                    בוקר {c.morning}
                    {shiftWeekday(date, view.dayInfo[date]) !== 5 ? ` · ערב ${c.evening}` : ""}
                    {c.absent ? ` · נעדרים ${c.absent}` : ""}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      )}

      <footer className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[9px] text-gray-600">
        {catalog.shifts
          .filter((s) => s.isActive)
          .map((s) => (
            <span key={s.id} className="flex items-center gap-1">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: s.color }}
              />
              {s.name}
            </span>
          ))}
        <span className="flex items-center gap-1">
          <Home className="h-2.5 w-2.5" /> עבודה ממיקום הדורש מכסה
        </span>
        <span>״ממתין לאישור״ / ״נדחה״: שיבוץ מעבר למכסה החודשית</span>
      </footer>
    </section>
  );
}

function Cell({ entry, catalog }: { entry: Assignment | undefined; catalog: Catalog }) {
  if (!entry) return <div className="h-8" />;
  const status = STATUS_TEXT[entry.quotaStatus];

  if (entry.kind === "absence") {
    const absence = catalog.absenceTypes.find((a) => a.id === entry.absenceTypeId);
    return (
      <div className="rounded border border-dashed border-gray-500 px-1 py-1 font-semibold italic">
        {absence?.name ?? "היעדרות"}
      </div>
    );
  }

  const shift = catalog.shifts.find((s) => s.id === entry.shiftId);
  const location = catalog.locations.find((l) => l.id === entry.locationId);
  return (
    <div
      className={cn(
        "rounded border-s-4 bg-gray-50 px-1 py-0.5 leading-tight",
        entry.quotaStatus === "rejected" && "line-through opacity-70",
      )}
      style={{ borderInlineStartColor: shift?.color ?? "#999" }}
    >
      <div className="font-bold">{shift?.name ?? "משמרת"}</div>
      <div
        className={cn(
          "flex items-center justify-center gap-0.5",
          location?.requiresQuota && "font-semibold",
        )}
      >
        {location?.requiresQuota ? <Home className="h-2.5 w-2.5" /> : null}
        {location?.name ?? ""}
      </div>
      {status ? <div className="text-[9px] font-semibold">{status}</div> : null}
    </div>
  );
}

function hasEntries(view: WeekView, agentId: string) {
  return Object.values(view.assignments).some((a) => a.agentId === agentId);
}

function coverage(view: WeekView, catalog: Catalog, date: string, agentIds: string[]) {
  let morning = 0;
  let evening = 0;
  let absent = 0;
  for (const id of agentIds) {
    const entry = view.assignments[assignmentId(id, date)];
    if (!entry) continue;
    if (entry.kind === "absence") {
      absent += 1;
      continue;
    }
    if (entry.quotaStatus === "rejected") continue;
    const shift = catalog.shifts.find((s) => s.id === entry.shiftId);
    if (shift?.coversMorning) morning += 1;
    if (shift?.coversEvening) evening += 1;
  }
  return { morning, evening, absent };
}
