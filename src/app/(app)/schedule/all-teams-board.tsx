"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileDown,
  FileSpreadsheet,
  Search,
} from "lucide-react";
import { TeamSelect } from "@/components/team-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { Menu, MenuItem } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import {
  addDays,
  formatDayMonth,
  todayIso,
  WEEKDAY_NAMES,
  weekdayOf,
  weekStartOf,
} from "@/lib/dates";
import { agentName } from "@/modules/agents/types";
import { shiftRunsOn } from "@/modules/calendar/types";
import type { Catalog } from "@/modules/catalog/service";
import type { WeekView } from "@/modules/schedule/service";
import { quotaPeriodKey } from "@/modules/schedule/quota";
import { seatUsage, type SeatUsage } from "@/modules/schedule/seats";
import { assignmentId } from "@/modules/schedule/types";
import type { Activity, GroupableTeam } from "@/modules/teams/types";
import { CellEditor, type EditTarget } from "./cell-editor";
import { EntryChip } from "./entry-chip";
import { DayHeader, HolidayTag, Legend, SeatsFooterRow } from "./schedule-board";
import { hasSeatLimits, LocationSplit, SeatsLine } from "./seats-summary";

type ViewAgent = WeekView["agents"][number];

/**
 * Several teams' week on one screen: every team (mainly for the shift lead) or one activity's
 * teams. Per day: agents on the morning and evening and where they work from, for the teams shown,
 * and the office seats across the whole center.
 */
export function AllTeamsBoard({
  views,
  catalog,
  seats,
  weekStart,
  label,
  selection,
  teams,
  activities,
}: {
  views: WeekView[];
  catalog: Catalog;
  /** Seats taken across the whole center this week. */
  seats: SeatUsage;
  weekStart: string;
  label: string;
  /** What is shown: "all" or an activity ("act:<id>"), with its Hebrew label. */
  selection: { value: string; label: string; isActivity: boolean };
  teams: GroupableTeam[];
  activities: Activity[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<{ view: WeekView; target: EditTarget } | null>(null);
  const href = (team: string, week: string) =>
    `/schedule?team=${encodeURIComponent(team)}&week=${week}`;
  const go = (week: string) => router.push(href(selection.value, week));
  const param = encodeURIComponent(selection.value);
  // Where the agents shown work from: the whole center, or only the activity's teams.
  const shown = selection.isActivity
    ? seatUsage(
        views.flatMap((v) => Object.values(v.assignments)),
        catalog.shifts,
      )
    : seats;
  const totalsLabel = selection.isActivity ? `סה״כ ב${selection.label}` : "סה״כ בכל המוקד";
  const days = views[0]?.days ?? [];
  const dayInfo = views[0]?.dayInfo ?? {};
  const today = views[0]?.today ?? todayIso();
  const q = query.trim();
  const matches = (a: ViewAgent) => !q || agentName(a).includes(q) || a.employeeNumber.includes(q);
  const published = views.filter((v) => v.week.status === "published").length;

  function open(view: WeekView, agent: ViewAgent, date: string) {
    const entry = view.assignments[assignmentId(agent.id, date)] ?? null;
    const editable = view.lockReason === null && agent.isActive && agent.inTeam;
    if (!entry && (!editable || dayInfo[date]?.kind === "closed")) return;
    setEditing({ view, target: { agent, date, entry } });
  }

  const totals = (date: string) => {
    let morning = 0;
    let evening = 0;
    let absent = 0;
    for (const v of views) {
      for (const a of v.agents) {
        const e = v.assignments[assignmentId(a.id, date)];
        if (!e) continue;
        if (e.kind === "absence") absent += 1;
        else if (e.quotaStatus !== "rejected") {
          const s = catalog.shifts.find((x) => x.id === e.shiftId);
          if (s?.coversMorning) morning += 1;
          if (s?.coversEvening) evening += 1;
        }
      }
    }
    return { morning, evening, absent };
  };
  const eveningOn = (date: string) =>
    catalog.shifts.some(
      (s) => s.isActive && s.coversEvening && shiftRunsOn(s, date, dayInfo[date]),
    );
  const [day, setDay] = useState(days.includes(today) ? today : days[0]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold sm:text-2xl">סידור עבודה</h1>
          <TeamSelect
            teams={teams}
            activities={activities}
            value={selection.value}
            onChange={(value) => router.push(href(value, weekStart))}
            className="h-9 font-medium"
          />
          <Badge tone={published === views.length ? "success" : "neutral"}>
            פורסמו {published} מתוך {views.length}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="secondary"
            size="icon"
            onClick={() => go(addDays(weekStart, -7))}
            aria-label="שבוע קודם"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <div className="min-w-40 text-center text-sm font-semibold">{label}</div>
          <Button
            variant="secondary"
            size="icon"
            onClick={() => go(addDays(weekStart, 7))}
            aria-label="שבוע הבא"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {weekStart !== weekStartOf(todayIso()) ? (
            <Button variant="ghost" size="sm" onClick={() => go(weekStartOf(todayIso()))}>
              השבוע
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1 sm:max-w-72">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
          <Input
            type="search"
            aria-label="חיפוש נציג"
            placeholder="חיפוש נציג…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-9 ps-9"
          />
        </div>
        <div className="ms-auto">
          <Menu label="ייצוא" icon={<Download className="h-4 w-4" />}>
            <MenuItem
              icon={<FileDown className="h-4 w-4" />}
              href={`/print/schedule?team=${param}&week=${weekStart}`}
              newTab
              hint="עמוד לכל צוות"
            >
              PDF
            </MenuItem>
            <MenuItem
              icon={<FileSpreadsheet className="h-4 w-4" />}
              href={`/schedule/export?team=${param}&week=${weekStart}`}
              hint="גיליון לכל צוות"
            >
              Excel
            </MenuItem>
          </Menu>
        </div>
      </div>

      {/* Desktop: one table, a section per team */}
      <Card className="hidden overflow-hidden md:block">
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-20">
              <tr>
                <th className="sticky start-0 z-10 min-w-48 border-b border-e border-border bg-muted px-3 py-2 text-start text-xs font-semibold text-fg-muted">
                  נציג
                </th>
                {days.map((d) => (
                  <th
                    key={d}
                    className={cn(
                      "min-w-28 border-b border-border px-2 py-2",
                      d === today ? "bg-primary/10" : "bg-muted",
                    )}
                  >
                    <DayHeader date={d} today={today} info={dayInfo[d]} />
                  </th>
                ))}
              </tr>
            </thead>
            {views.map((view) => {
              const agents = view.agents.filter(matches);
              if (agents.length === 0) return null;
              return (
                <tbody key={view.team.id}>
                  <tr>
                    <th
                      colSpan={days.length + 1}
                      className="border-b border-border bg-muted/40 px-3 py-1.5 text-start"
                    >
                      <span className="flex items-center gap-2">
                        <Link
                          href={href(view.team.id, weekStart)}
                          className="flex items-center gap-1 font-semibold hover:text-primary"
                        >
                          {view.team.name}
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                        <Badge tone={view.week.status === "published" ? "success" : "neutral"}>
                          {view.week.status === "published" ? "פורסם" : "טיוטה"}
                        </Badge>
                        <span className="text-xs font-normal text-fg-muted">
                          {agents.length} נציגים
                        </span>
                      </span>
                    </th>
                  </tr>
                  {agents.map((agent) => (
                    <tr
                      key={agent.id}
                      className={cn(!agent.isActive || !agent.inTeam ? "opacity-60" : "")}
                    >
                      <th className="sticky start-0 z-10 border-b border-e border-border bg-surface px-3 py-1.5 text-start font-normal">
                        <p className="truncate font-medium">{agentName(agent)}</p>
                        <p className="text-xs text-fg-subtle">{agent.employeeNumber}</p>
                      </th>
                      {days.map((date) => {
                        const entry = view.assignments[assignmentId(agent.id, date)];
                        const closed = dayInfo[date]?.kind === "closed";
                        const clickable =
                          entry ||
                          (view.lockReason === null && agent.isActive && agent.inTeam && !closed);
                        return (
                          <td
                            key={date}
                            className={cn(
                              "border-b border-border p-1 text-center align-middle",
                              date === today && "bg-primary/5",
                              closed && "bg-muted/60",
                            )}
                          >
                            {clickable ? (
                              <button
                                type="button"
                                onClick={() => open(view, agent, date)}
                                className="flex min-h-10 w-full items-center justify-center rounded-lg hover:bg-muted"
                                aria-label={`${agentName(agent)} ${formatDayMonth(date)}`}
                              >
                                {entry ? <EntryChip entry={entry} catalog={catalog} /> : null}
                              </button>
                            ) : (
                              <div className="min-h-10" />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              );
            })}
            <tfoot className="sticky bottom-0 z-20">
              <tr className="bg-muted">
                <th className="sticky start-0 z-10 border-t border-e border-border bg-muted px-3 py-2 text-start text-xs font-semibold text-fg-muted">
                  {totalsLabel}
                </th>
                {days.map((date) => {
                  const t = totals(date);
                  return (
                    <td
                      key={date}
                      className="border-t border-border bg-muted px-2 py-2 text-center text-xs text-fg-muted"
                    >
                      <div>
                        בוקר: <strong className="text-fg">{t.morning}</strong>
                      </div>
                      <LocationSplit
                        usage={shown}
                        date={date}
                        half="morning"
                        locations={catalog.locations}
                      />
                      {eveningOn(date) ? (
                        <>
                          <div>
                            ערב: <strong className="text-fg">{t.evening}</strong>
                          </div>
                          <LocationSplit
                            usage={shown}
                            date={date}
                            half="evening"
                            locations={catalog.locations}
                          />
                        </>
                      ) : null}
                      {t.absent ? <div>נעדרים: {t.absent}</div> : null}
                    </td>
                  );
                })}
              </tr>
              {hasSeatLimits(catalog.locations) ? (
                <SeatsFooterRow
                  days={days}
                  dayInfo={dayInfo}
                  seats={seats}
                  catalog={catalog}
                  label={selection.isActivity ? "עמדות בכל המוקד" : "עמדות"}
                />
              ) : null}
            </tfoot>
          </table>
        </div>
      </Card>

      {/* Mobile: one day at a time */}
      <div className="space-y-3 md:hidden">
        <div className="sticky top-13 z-20 -mx-4 flex gap-1.5 overflow-x-auto bg-bg/95 px-4 py-2 backdrop-blur">
          {days.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDay(d)}
              className={cn(
                "flex min-w-14 flex-col items-center rounded-xl border px-2 py-1.5",
                d === day
                  ? "border-primary bg-primary text-white"
                  : "border-border bg-surface text-fg",
              )}
            >
              <span className="text-xs font-semibold">{WEEKDAY_NAMES[weekdayOf(d)]}</span>
              <span className={cn("text-[11px]", d === day ? "text-white/80" : "text-fg-muted")}>
                {formatDayMonth(d)}
              </span>
            </button>
          ))}
        </div>
        <HolidayTag info={dayInfo[day]} />
        {day ? (
          <Card className="space-y-1 p-3 text-xs text-fg-muted">
            {selection.isActivity ? (
              <div className="font-semibold text-fg">{totalsLabel}</div>
            ) : null}
            <div>
              בוקר: <strong className="text-fg">{totals(day).morning}</strong>
              {eveningOn(day) ? (
                <>
                  {" "}
                  · ערב: <strong className="text-fg">{totals(day).evening}</strong>
                </>
              ) : null}
            </div>
            <LocationSplit usage={shown} date={day} half="morning" locations={catalog.locations} />
            <SeatsLine
              usage={seats}
              date={day}
              half="morning"
              label={selection.isActivity ? "עמדות בכל המוקד בבוקר ·" : "עמדות בבוקר ·"}
              locations={catalog.locations}
            />
            {eveningOn(day) ? (
              <SeatsLine
                usage={seats}
                date={day}
                half="evening"
                label={selection.isActivity ? "עמדות בכל המוקד בערב ·" : "עמדות בערב ·"}
                locations={catalog.locations}
              />
            ) : null}
          </Card>
        ) : null}
        {views.map((view) => {
          const agents = view.agents.filter(matches);
          if (agents.length === 0) return null;
          return (
            <section key={view.team.id}>
              <div className="mb-1.5 flex items-center gap-2">
                <Link href={href(view.team.id, weekStart)} className="font-semibold">
                  {view.team.name}
                </Link>
                <Badge tone={view.week.status === "published" ? "success" : "neutral"}>
                  {view.week.status === "published" ? "פורסם" : "טיוטה"}
                </Badge>
              </div>
              <Card className="divide-y divide-border">
                {agents.map((agent) => {
                  const entry = view.assignments[assignmentId(agent.id, day)];
                  return (
                    <button
                      key={agent.id}
                      type="button"
                      onClick={() => open(view, agent, day)}
                      className="flex w-full items-center gap-3 px-3 py-2 text-start"
                    >
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {agentName(agent)}
                      </span>
                      <span className="w-28 shrink-0">
                        {entry ? <EntryChip entry={entry} catalog={catalog} /> : null}
                      </span>
                    </button>
                  );
                })}
              </Card>
            </section>
          );
        })}
      </div>

      <Legend catalog={catalog} />

      {editing ? (
        <CellEditor
          key={`${editing.target.agent.id}_${editing.target.date}`}
          target={editing.target}
          catalog={catalog}
          usage={editing.view.quotaUsage[editing.target.agent.id]?.find(
            (u) => u.key === quotaPeriodKey(editing.target.date, editing.view.quotaPeriod),
          )}
          approval={
            editing.target.entry?.approvalId
              ? editing.view.approvals[editing.target.entry.approvalId]
              : undefined
          }
          day={dayInfo[editing.target.date]}
          readOnly={editing.view.lockReason !== null}
          onClose={() => setEditing(null)}
          onRangeResult={(r) => toast.success(r.summary)}
        />
      ) : null}
    </div>
  );
}
