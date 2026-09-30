"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  MessageSquare,
  Pencil,
  Search,
  UserPlus,
  X,
} from "lucide-react";
import { TeamSelect } from "@/components/team-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/page-header";
import { useToast } from "@/components/ui/toast";
import { useAction } from "@/components/ui/use-action";
import { cn } from "@/lib/cn";
import { addDays } from "@/lib/dates";
import {
  formatMinutes,
  NOTE_MAX,
  summarizeAttendance,
  type AttendanceDay,
  type AttendanceRow,
} from "@/modules/attendance/types";
import type { AttendanceStatus } from "@/modules/catalog/service";
import { ALL_TEAMS, resolveTeamSelection, selectionTeamIds } from "@/modules/teams/types";
import { clearAttendanceAction, recordAttendanceAction, recordManyAction } from "./actions";

const ALL_SHIFTS: AttendanceDay["shifts"][number] = {
  id: "all",
  name: "כל המשמרות",
  color: "",
  startTime: null,
  endTime: null,
};

type Filter = "all" | "unmarked" | "present" | "late" | "absent";

/** Reloads the day every minute while the tab is visible, so two shift leads see each other. */
const REFRESH_MS = 60_000;

export function AttendanceBoard({
  day,
  initialShift,
  initialTeam,
}: {
  day: AttendanceDay;
  initialShift?: string;
  initialTeam?: string;
}) {
  const router = useRouter();
  const [shiftId, setShiftId] = useState<string>(
    initialShift === "all" || day.shifts.some((s) => s.id === initialShift)
      ? initialShift!
      : (day.currentShiftId ?? "all"),
  );
  // A team id, "all" or an activity ("act:<id>").
  const [teamValue, setTeamValue] = useState(
    resolveTeamSelection(initialTeam, day.teams, day.activities)?.value ?? ALL_TEAMS,
  );
  const selection = resolveTeamSelection(teamValue, day.teams, day.activities);
  const selectedTeams = selection ? new Set(selectionTeamIds(selection)) : null;
  const inTeams = (teamId: string) => !selectedTeams || selectedTeams.has(teamId);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<{ row: AttendanceRow; statusId?: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const bulk = useAction();
  const toast = useToast();

  useEffect(() => {
    if (editing || adding) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [router, editing, adding]);

  // Keep the chosen shift and team in the address, so a refresh or a shared link keeps them.
  useEffect(() => {
    const params = new URLSearchParams({ date: day.date, shift: shiftId });
    if (teamValue !== ALL_TEAMS) params.set("team", teamValue);
    window.history.replaceState(null, "", `/attendance?${params}`);
  }, [day.date, shiftId, teamValue]);

  const statusById = useMemo(() => new Map(day.statuses.map((s) => [s.id, s])), [day.statuses]);
  const teamById = useMemo(() => new Map(day.teams.map((t) => [t.id, t])), [day.teams]);
  const shiftById = useMemo(() => new Map(day.shifts.map((s) => [s.id, s])), [day.shifts]);
  const locationById = useMemo(() => new Map(day.locations.map((l) => [l.id, l])), [day.locations]);

  const inView = day.rows.filter(
    (r) => (shiftId === "all" || r.shiftId === shiftId) && inTeams(r.teamId),
  );
  const summary = summarizeAttendance(inView, day.statuses);
  const q = query.trim();
  const visible = inView.filter((r) => {
    if (q && !r.name.includes(q) && !r.employeeNumber.includes(q)) return false;
    const status = r.record ? statusById.get(r.record.statusId) : undefined;
    switch (filter) {
      case "unmarked":
        return !r.record;
      case "present":
        return !!r.record && status?.presence !== "absent";
      case "late":
        return status?.timeField === "arrival";
      case "absent":
        return status?.presence === "absent";
      default:
        return true;
    }
  });
  const groups = day.teams
    .map((t) => ({ team: t, rows: visible.filter((r) => r.teamId === t.id) }))
    .filter((g) => g.rows.length > 0);
  const drafts = day.teams.filter((t) => !t.published && inView.some((r) => r.teamId === t.id));
  const absences = day.absences.filter((a) => inTeams(a.teamId));

  const readOnly = day.isFuture;
  const cameStatus = day.statuses.find((s) => s.presence === "present" && s.timeField === "none");
  const unmarkedManageable = inView.filter((r) => !r.record && r.canManage);
  const canAdd = !readOnly && day.addable.length > 0;

  const goToDate = (date: string) => {
    const params = new URLSearchParams({ date });
    if (teamValue !== ALL_TEAMS) params.set("team", teamValue);
    router.push(`/attendance?${params}`);
  };

  return (
    <div className="space-y-4">
      {/* Day, shift and team */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant="secondary"
            size="icon"
            aria-label="יום קודם"
            onClick={() => goToDate(addDays(day.date, -1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Input
            type="date"
            aria-label="תאריך"
            value={day.date}
            onChange={(e) => e.target.value && goToDate(e.target.value)}
            className="w-40"
          />
          <Button
            variant="secondary"
            size="icon"
            aria-label="יום הבא"
            onClick={() => goToDate(addDays(day.date, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {day.date !== day.today ? (
            <Button variant="ghost" size="sm" onClick={() => goToDate(day.today)}>
              היום
            </Button>
          ) : null}
        </div>
        {day.teams.length > 1 ? (
          <TeamSelect
            teams={day.teams}
            activities={day.activities}
            value={teamValue}
            onChange={setTeamValue}
          />
        ) : null}
        <div className="relative min-w-40 flex-1 sm:max-w-64">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
          <Input
            type="search"
            aria-label="חיפוש נציג"
            placeholder="חיפוש נציג…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="ps-9"
          />
        </div>
        {canAdd ? (
          <Button variant="secondary" onClick={() => setAdding(true)} className="ms-auto">
            <UserPlus className="h-4 w-4" />
            נציג שלא בסידור
          </Button>
        ) : null}
      </div>

      {day.shifts.length > 0 ? (
        <nav aria-label="משמרות" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <div className="inline-flex min-w-max rounded-lg bg-muted p-1">
            {[ALL_SHIFTS, ...day.shifts].map((s) => {
              const count = day.rows.filter(
                (r) => (s.id === "all" || r.shiftId === s.id) && inTeams(r.teamId),
              ).length;
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={shiftId === s.id}
                  onClick={() => setShiftId(s.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3.5 py-1.5 text-sm font-medium whitespace-nowrap",
                    shiftId === s.id ? "bg-surface shadow-sm" : "text-fg-muted hover:text-fg",
                  )}
                >
                  {s.color ? (
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: s.color }}
                      aria-hidden
                    />
                  ) : null}
                  {s.name}
                  {s.startTime && s.endTime ? (
                    <span className="text-xs text-fg-subtle tabular-nums">
                      {s.startTime}–{s.endTime}
                    </span>
                  ) : null}
                  {s.id === day.currentShiftId && day.date === day.today ? (
                    <Badge tone="success">עכשיו</Badge>
                  ) : null}
                  <span className="text-xs text-fg-subtle tabular-nums">{count}</span>
                </button>
              );
            })}
          </div>
        </nav>
      ) : null}

      {drafts.length > 0 ? (
        <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning-fg">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          הסידור של {drafts.map((t) => t.name).join(", ")} עוד לא פורסם. מוצג לפי הטיוטה, ויכול
          להשתנות.
        </p>
      ) : null}
      {readOnly ? (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm text-fg-muted">
          יום עתידי: מוצג הסידור המתוכנן. אפשר לסמן נוכחות מהיום עצמו.
        </p>
      ) : null}

      {/* Summary: click a tile to show only those agents */}
      <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
        <SummaryTile
          label="משובצים"
          value={summary.planned}
          active={filter === "all"}
          onClick={() => setFilter("all")}
        />
        <SummaryTile
          label="הגיעו"
          value={summary.present}
          tone="success"
          active={filter === "present"}
          onClick={() => setFilter(filter === "present" ? "all" : "present")}
        />
        <SummaryTile
          label="איחורים"
          value={summary.late}
          tone="warning"
          active={filter === "late"}
          onClick={() => setFilter(filter === "late" ? "all" : "late")}
        />
        <SummaryTile
          label="לא הגיעו"
          value={summary.absent}
          tone="danger"
          active={filter === "absent"}
          onClick={() => setFilter(filter === "absent" ? "all" : "absent")}
        />
        <SummaryTile
          label="לא סומנו"
          value={summary.unmarked}
          tone={summary.unmarked ? "primary" : "neutral"}
          active={filter === "unmarked"}
          onClick={() => setFilter(filter === "unmarked" ? "all" : "unmarked")}
        />
      </div>

      {!readOnly && cameStatus && unmarkedManageable.length > 1 ? (
        <div className="flex justify-end">
          <Button
            variant="secondary"
            size="sm"
            loading={bulk.pending}
            onClick={() => {
              if (
                !window.confirm(
                  `לסמן "${cameStatus.name}" ל-${unmarkedManageable.length} נציגים שעוד לא סומנו?`,
                )
              ) {
                return;
              }
              bulk.run(
                () =>
                  recordManyAction(
                    day.date,
                    unmarkedManageable.map((r) => r.agentId),
                    cameStatus.id,
                  ),
                { onSuccess: (d) => toast.success(d.summary) },
              );
            }}
          >
            <CheckCheck className="h-4 w-4" />
            כל מי שלא סומן: {cameStatus.name} ({unmarkedManageable.length})
          </Button>
        </div>
      ) : null}

      {groups.length === 0 ? (
        <Card>
          <EmptyState
            title={inView.length === 0 ? "אין נציגים משובצים" : "אין נציגים שמתאימים לסינון"}
            description={
              inView.length === 0
                ? "לא שובצו נציגים במשמרת הזו. אפשר לבחור משמרת אחרת או יום אחר."
                : undefined
            }
          />
        </Card>
      ) : (
        groups.map(({ team, rows }) => (
          <section key={team.id}>
            <div className="mb-2 flex items-center gap-2">
              <h2 className="font-semibold">{team.name}</h2>
              <Badge tone={team.published ? "success" : "neutral"}>
                {team.published ? "פורסם" : "טיוטה"}
              </Badge>
              <span className="text-xs text-fg-muted">{rows.length} נציגים</span>
            </div>
            <Card className="divide-y divide-border overflow-hidden">
              {rows.map((row) => (
                <AttendanceRowView
                  key={row.agentId}
                  row={row}
                  day={day}
                  showShift={shiftId === "all"}
                  readOnly={readOnly || !row.canManage}
                  statusById={statusById}
                  shift={row.shiftId ? shiftById.get(row.shiftId) : undefined}
                  locationById={locationById}
                  onEdit={(statusId) => setEditing({ row, statusId })}
                />
              ))}
            </Card>
          </section>
        ))
      )}

      {absences.length > 0 ? (
        <details className="rounded-xl border border-border bg-surface px-4 py-3 text-sm">
          <summary className="cursor-pointer font-medium">
            בהיעדרות מתוכננת ({absences.length})
          </summary>
          <ul className="mt-2 space-y-1 text-fg-muted">
            {absences.map((a) => (
              <li key={a.agentId}>
                {a.name} · {teamById.get(a.teamId)?.name} · {a.absenceName}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <p className="text-xs text-fg-muted">
        הסימון לא משנה את הסידור עצמו, ונשמר בנפרד כדי להשוות בין התכנון לביצוע. כל סימון נרשם בלוג
        הפעולות. הרשימה מתעדכנת כל דקה.{" "}
        <Link href="/settings?tab=attendance" className="underline">
          סטטוסים
        </Link>
      </p>

      {editing ? (
        <RecordDialog
          day={day}
          row={editing.row}
          initialStatusId={editing.statusId}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {adding ? <RecordDialog day={day} onClose={() => setAdding(false)} /> : null}
    </div>
  );
}

const TILE_TONES = {
  neutral: "text-fg",
  primary: "text-primary",
  success: "text-success",
  warning: "text-warning-fg",
  danger: "text-danger",
} as const;

function SummaryTile({
  label,
  value,
  tone = "neutral",
  active,
  onClick,
  className,
}: {
  label: string;
  value: number;
  tone?: keyof typeof TILE_TONES;
  active: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-xl border bg-surface px-2 py-2 text-start transition hover:border-primary/40 sm:px-3 sm:py-2.5",
        active ? "border-primary ring-2 ring-primary/20" : "border-border",
        className,
      )}
    >
      <span className={cn("block text-xl font-bold tabular-nums sm:text-2xl", TILE_TONES[tone])}>
        {value}
      </span>
      <span className="block text-[11px] leading-tight text-fg-muted sm:text-xs">{label}</span>
    </button>
  );
}

function AttendanceRowView({
  row,
  day,
  showShift,
  readOnly,
  statusById,
  shift,
  locationById,
  onEdit,
}: {
  row: AttendanceRow;
  day: AttendanceDay;
  showShift: boolean;
  readOnly: boolean;
  statusById: Map<string, AttendanceStatus>;
  shift: AttendanceDay["shifts"][number] | undefined;
  locationById: Map<string, { id: string; name: string; color: string }>;
  onEdit: (statusId?: string) => void;
}) {
  const { run, pending } = useAction();
  const record = row.record;
  const status = record ? statusById.get(record.statusId) : undefined;
  const planned = row.plannedLocationId ? locationById.get(row.plannedLocationId) : undefined;
  const actualLocationId = record?.locationId ?? null;
  const moved =
    status?.presence === "present" &&
    actualLocationId &&
    row.plannedLocationId &&
    actualLocationId !== row.plannedLocationId;

  function mark(s: AttendanceStatus) {
    if (
      s.timeField !== "none" ||
      (s.presence === "present" && !row.plannedLocationId && !actualLocationId)
    ) {
      onEdit(s.id);
      return;
    }
    run(() =>
      recordAttendanceAction({
        date: day.date,
        agentId: row.agentId,
        statusId: s.id,
        locationId: actualLocationId,
        note: record?.note ?? "",
      }),
    );
  }

  function moveTo(locationId: string) {
    if (!record) return;
    run(() =>
      recordAttendanceAction({
        date: day.date,
        agentId: row.agentId,
        statusId: record.statusId,
        locationId,
        time: record.time,
        note: record.note,
      }),
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4",
        pending && "opacity-60",
      )}
    >
      <div className="min-w-0 sm:w-56 sm:shrink-0">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{row.name}</span>
          {row.unscheduled ? <Badge tone="warning">לא בסידור</Badge> : null}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-fg-muted">
          {showShift && shift ? (
            <span className="flex items-center gap-1">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: shift.color }}
                aria-hidden
              />
              {shift.name}
            </span>
          ) : null}
          {planned ? (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {planned.name}
            </span>
          ) : null}
          {row.note ? (
            <span className="flex items-center gap-1" title={row.note}>
              <MessageSquare className="h-3 w-3" />
              <span className="max-w-32 truncate">{row.note}</span>
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-wrap items-center gap-1 sm:gap-1.5">
        {day.statuses.map((s) => {
          const selected = record?.statusId === s.id;
          return (
            <button
              key={s.id}
              type="button"
              disabled={readOnly || pending}
              aria-pressed={selected}
              onClick={() => (selected && s.timeField === "none" ? undefined : mark(s))}
              className={cn(
                "h-8 rounded-lg border px-2.5 text-[13px] font-medium transition disabled:cursor-default sm:h-9 sm:px-3 sm:text-sm",
                selected ? "text-white shadow-sm" : "bg-surface text-fg-muted",
                !selected && !readOnly && "hover:bg-muted",
                readOnly && !selected && "opacity-50",
              )}
              style={
                selected
                  ? { backgroundColor: s.color, borderColor: s.color }
                  : { borderColor: `${s.color}55` }
              }
            >
              {s.name}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        {record?.time ? (
          <Badge tone="warning">
            <Clock className="h-3 w-3" />
            {record.time}
            {record.minutesOff ? ` · ${formatMinutes(record.minutesOff)}` : ""}
          </Badge>
        ) : null}
        {status?.presence === "present" ? (
          readOnly ? (
            actualLocationId ? (
              <Badge tone={moved ? "warning" : "neutral"}>
                <MapPin className="h-3 w-3" />
                {locationById.get(actualLocationId)?.name}
              </Badge>
            ) : null
          ) : (
            <Select
              aria-label="מאיפה עובד/ת בפועל"
              value={actualLocationId ?? ""}
              disabled={pending}
              onChange={(e) => moveTo(e.target.value)}
              className={cn("h-9 w-auto min-w-24", moved && "border-warning bg-warning/10")}
            >
              {day.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          )
        ) : null}
        {record?.note ? (
          <span title={record.note} className="text-fg-muted">
            <MessageSquare className="h-4 w-4" />
          </span>
        ) : null}
        {!readOnly ? (
          <>
            <Button
              variant="ghost"
              size="icon"
              aria-label="פרטים והערה"
              disabled={pending}
              onClick={() => onEdit(record?.statusId)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            {record ? (
              <Button
                variant="ghost"
                size="icon"
                aria-label="ביטול הסימון"
                disabled={pending}
                onClick={() => run(() => clearAttendanceAction(day.date, row.agentId))}
              >
                <X className="h-4 w-4" />
              </Button>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

/** Status with a time, location and note; or a new agent who isn't on the schedule (no row). */
function RecordDialog({
  day,
  row,
  initialStatusId,
  onClose,
}: {
  day: AttendanceDay;
  row?: AttendanceRow;
  initialStatusId?: string;
  onClose: () => void;
}) {
  const record = row?.record ?? null;
  const [agentId, setAgentId] = useState(row?.agentId ?? day.addable[0]?.agentId ?? "");
  const [statusId, setStatusId] = useState(
    initialStatusId ?? record?.statusId ?? day.statuses[0]?.id ?? "",
  );
  const [shiftId, setShiftId] = useState(row?.shiftId ?? day.currentShiftId ?? "");
  const [locationId, setLocationId] = useState(
    record?.locationId ??
      row?.plannedLocationId ??
      day.locations.find((l) => l.name === "מוקד")?.id ??
      day.locations[0]?.id ??
      "",
  );
  const [time, setTime] = useState(record?.time ?? (day.date === day.today ? day.now : ""));
  const [note, setNote] = useState(record?.note ?? "");
  const [agentQuery, setAgentQuery] = useState("");
  const { run, pending, error } = useAction();
  const status = day.statuses.find((s) => s.id === statusId);

  const agentOptions = day.addable.filter((a) => !agentQuery || a.name.includes(agentQuery.trim()));
  const teamName = (id: string) => day.teams.find((t) => t.id === id)?.name ?? "";

  function save() {
    run(
      () =>
        recordAttendanceAction({
          date: day.date,
          agentId,
          statusId,
          locationId: status?.presence === "present" ? locationId || null : null,
          time: status && status.timeField !== "none" ? time || null : null,
          note,
          shiftId: row ? null : shiftId || null,
        }),
      { onSuccess: onClose, success: "הנוכחות נשמרה" },
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={row ? `נוכחות: ${row.name}` : "נציג שלא בסידור"}
      description={row ? undefined : "נציג שהגיע למרות שלא שובץ היום. הסידור עצמו לא משתנה."}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            ביטול
          </Button>
          <Button onClick={save} loading={pending} disabled={!agentId || !statusId}>
            שמירה
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormError error={error} />
        {!row ? (
          <>
            <Field label="נציג" htmlFor="att-agent">
              <Input
                type="search"
                placeholder="חיפוש…"
                value={agentQuery}
                onChange={(e) => setAgentQuery(e.target.value)}
                className="mb-2"
                aria-label="חיפוש נציג"
              />
              <Select
                id="att-agent"
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                size={Math.min(6, Math.max(2, agentOptions.length))}
                className="h-auto py-1"
              >
                {agentOptions.map((a) => (
                  <option key={a.agentId} value={a.agentId}>
                    {a.name} · {teamName(a.teamId)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="משמרת" htmlFor="att-shift">
              <Select id="att-shift" value={shiftId} onChange={(e) => setShiftId(e.target.value)}>
                {day.shifts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        ) : null}

        <Field label="סטטוס">
          <div className="flex flex-wrap gap-1.5">
            {day.statuses.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={s.id === statusId}
                onClick={() => setStatusId(s.id)}
                className={cn(
                  "h-9 rounded-lg border px-3 text-sm font-medium transition",
                  s.id === statusId
                    ? "text-white shadow-sm"
                    : "bg-surface text-fg-muted hover:bg-muted",
                )}
                style={
                  s.id === statusId
                    ? { backgroundColor: s.color, borderColor: s.color }
                    : { borderColor: `${s.color}55` }
                }
              >
                {s.name}
              </button>
            ))}
          </div>
        </Field>

        {status && status.timeField !== "none" ? (
          <Field
            label={status.timeField === "arrival" ? "שעת הגעה" : "שעת יציאה"}
            htmlFor="att-time"
          >
            <Input
              id="att-time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="max-w-36"
            />
          </Field>
        ) : null}

        {status?.presence === "present" ? (
          <Field
            label="מאיפה עובד/ת בפועל"
            htmlFor="att-location"
            hint={
              row?.plannedLocationId
                ? `בסידור: ${day.locations.find((l) => l.id === row.plannedLocationId)?.name ?? ""}`
                : undefined
            }
          >
            <Select
              id="att-location"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
            >
              {day.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        <Field label="הערה" htmlFor="att-note" hint="אופציונלי, למשל סיבת האיחור">
          <Textarea
            id="att-note"
            value={note}
            maxLength={NOTE_MAX}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
        {record ? (
          <p className="text-xs text-fg-muted">סומן על ידי {record.recordedByName}</p>
        ) : null}
      </div>
    </Dialog>
  );
}
