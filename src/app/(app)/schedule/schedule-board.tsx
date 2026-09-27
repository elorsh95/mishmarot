"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Eraser,
  FileDown,
  FileSpreadsheet,
  Lock,
  Plus,
  Send,
  Share2,
  Undo2,
  Wand2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/form";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/menu";
import { EmptyState } from "@/components/ui/page-header";
import { useToast } from "@/components/ui/toast";
import { useAction } from "@/components/ui/use-action";
import { cn } from "@/lib/cn";
import {
  addDays,
  formatDate,
  formatDayMonth,
  todayIso,
  weekStartOf,
  WEEKDAY_NAMES,
  weekdayOf,
} from "@/lib/dates";
import { agentName, type Agent } from "@/modules/agents/types";
import { shiftRunsOn, shiftWeekday, type DayInfo } from "@/modules/calendar/types";
import type { Catalog } from "@/modules/catalog/service";
import type { SkippedOp } from "@/modules/schedule/engine";
import type { WeekView } from "@/modules/schedule/service";
import { quotaPeriodKey } from "@/modules/schedule/quota";
import { assignmentId, type Assignment } from "@/modules/schedule/types";
import {
  clearWeekAction,
  copyPreviousWeekAction,
  fillDefaultsAction,
  setWeekStatusAction,
} from "./actions";
import { BulkEditor } from "./bulk-editor";
import { CellEditor, QuotaBadge, QuotaSummaryBadge, type EditTarget } from "./cell-editor";
import { EntryChip } from "./entry-chip";
import { ShareDialog } from "./share-dialog";

type ViewMode = "agents" | "coverage";

export function ScheduleBoard({
  view,
  catalog,
  teams,
  canViewAgents,
}: {
  view: WeekView;
  catalog: Catalog;
  teams: Array<{ id: string; name: string }>;
  canViewAgents: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<ViewMode>("agents");
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [skipped, setSkipped] = useState<SkippedOp[] | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkEditing, setBulkEditing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const bulk = useAction();
  const toast = useToast();

  const editable = view.lockReason === null;
  const href = (teamId: string, weekStart: string) => `/schedule?team=${teamId}&week=${weekStart}`;
  const go = (weekStart: string) => router.push(href(view.team.id, weekStart));
  const entryOf = (agentId: string, date: string) =>
    view.assignments[assignmentId(agentId, date)] ?? null;
  const usageOf = (agentId: string, date: string) =>
    view.quotaUsage[agentId]?.find((u) => u.key === quotaPeriodKey(date, view.quotaPeriod));

  const cellKey = (agentId: string, date: string) => `${agentId}|${date}`;
  const selectable = (agent: Agent & { inTeam: boolean }, date: string) =>
    editable && agent.isActive && agent.inTeam && view.dayInfo[date]?.kind !== "closed";

  /** Toggles a group of cells: selects all of them, or clears them if all were selected. */
  function toggleCells(keys: string[]) {
    setSelected((prev) => {
      const next = new Set(prev);
      const all = keys.length > 0 && keys.every((k) => next.has(k));
      for (const k of keys) {
        if (all) next.delete(k);
        else next.add(k);
      }
      return next;
    });
  }
  const selection: Selection = {
    active: selecting,
    has: (agentId, date) => selected.has(cellKey(agentId, date)),
    selectable,
    toggleColumn: (date) =>
      toggleCells(view.agents.filter((a) => selectable(a, date)).map((a) => cellKey(a.id, date))),
    toggleRow: (agent) =>
      toggleCells(view.days.filter((d) => selectable(agent, d)).map((d) => cellKey(agent.id, d))),
  };
  const selectedCells = [...selected].map((k) => {
    const [agentId, date] = k.split("|");
    return { agentId, date };
  });
  function endSelection() {
    setSelecting(false);
    setSelected(new Set());
  }

  function openCell(agent: Agent & { inTeam: boolean }, date: string) {
    if (selecting) {
      if (selectable(agent, date)) toggleCells([cellKey(agent.id, date)]);
      return;
    }
    const entry = entryOf(agent.id, date);
    if (!editable && !entry) return;
    if (editable && !agent.isActive && !entry) return;
    setEditing({ agent, date, entry });
  }

  function showResult(data: { summary: string; skipped: SkippedOp[] }) {
    toast.success(data.summary);
    if (data.skipped.length > 0) setSkipped(data.skipped);
  }

  function runBulk(action: () => ReturnType<typeof copyPreviousWeekAction>) {
    bulk.run(action, { onSuccess: showResult });
  }

  const pendingCount = Object.values(view.assignments).filter(
    (a) => a.quotaStatus === "pending",
  ).length;
  const rejectedCount = Object.values(view.assignments).filter(
    (a) => a.quotaStatus === "rejected",
  ).length;

  const toolItems = (
    <>
      <MenuItem
        icon={<Copy className="h-4 w-4" />}
        onClick={() => runBulk(() => copyPreviousWeekAction(view.team.id, view.weekStart))}
        hint="ממלא ימים ריקים לפי השבוע הקודם"
      >
        העתקה משבוע קודם
      </MenuItem>
      <MenuItem
        icon={<Wand2 className="h-4 w-4" />}
        onClick={() => runBulk(() => fillDefaultsAction(view.team.id, view.weekStart))}
        hint="לפי המשמרת, המיקום וימי העבודה הקבועים של כל נציג"
      >
        מילוי לפי ברירת מחדל
      </MenuItem>
      <MenuSeparator />
      <MenuItem
        icon={<Eraser className="h-4 w-4" />}
        tone="danger"
        disabled={Object.keys(view.assignments).length === 0}
        onClick={() => setConfirmClear(true)}
        hint="מחיקת כל השיבוצים של השבוע"
      >
        ניקוי השבוע
      </MenuItem>
    </>
  );
  const exportItems = (
    <>
      <MenuLabel>צוות {view.team.name}</MenuLabel>
      <MenuItem
        icon={<FileDown className="h-4 w-4" />}
        href={`/print/schedule?team=${view.team.id}&week=${view.weekStart}`}
        newTab
        hint="להדפסה או לשמירה כקובץ"
      >
        PDF
      </MenuItem>
      <MenuItem
        icon={<FileSpreadsheet className="h-4 w-4" />}
        href={`/schedule/export?team=${view.team.id}&week=${view.weekStart}`}
        hint="קובץ לעריכה ולסינון"
      >
        Excel
      </MenuItem>
      {teams.length > 1 ? (
        <>
          <MenuSeparator />
          <MenuLabel>כל הצוותים</MenuLabel>
          <MenuItem
            icon={<FileDown className="h-4 w-4" />}
            href={`/print/schedule?team=all&week=${view.weekStart}`}
            newTab
            hint="עמוד לכל צוות"
          >
            PDF
          </MenuItem>
          <MenuItem
            icon={<FileSpreadsheet className="h-4 w-4" />}
            href={`/schedule/export?team=all&week=${view.weekStart}`}
            hint="גיליון לכל צוות"
          >
            Excel
          </MenuItem>
        </>
      ) : null}
      {view.canPublish ? (
        <>
          <MenuSeparator />
          <MenuItem
            icon={<Share2 className="h-4 w-4" />}
            onClick={() => setSharing(true)}
            hint="קישור לצפייה בלבד, גם לוואטסאפ"
          >
            שיתוף עם הנציגים
          </MenuItem>
        </>
      ) : null}
    </>
  );
  const selectToggle = () => (selecting ? endSelection() : setSelecting(true));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold sm:text-2xl">סידור עבודה</h1>
          {teams.length > 1 ? (
            <Select
              aria-label="צוות"
              value={view.team.id}
              onChange={(e) => router.push(href(e.target.value, view.weekStart))}
              className="h-9 w-auto min-w-36 font-medium"
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          ) : (
            <Badge tone="primary" className="text-sm">
              {view.team.name}
            </Badge>
          )}
          <Badge tone={view.week.status === "published" ? "success" : "neutral"}>
            {view.week.status === "published" ? "פורסם" : "טיוטה"}
          </Badge>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="secondary"
            size="icon"
            onClick={() => go(addDays(view.weekStart, -7))}
            aria-label="שבוע קודם"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <div className="min-w-40 text-center text-sm font-semibold">{view.label}</div>
          <Button
            variant="secondary"
            size="icon"
            onClick={() => go(addDays(view.weekStart, 7))}
            aria-label="שבוע הבא"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {view.weekStart !== weekStartOf(todayIso()) ? (
            <Button variant="ghost" size="sm" onClick={() => go(weekStartOf(todayIso()))}>
              השבוע
            </Button>
          ) : null}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-border bg-muted p-0.5">
          {(
            [
              ["agents", "לפי נציגים", "נציגים"],
              ["coverage", "כיסוי משמרות", "כיסוי"],
            ] as const
          ).map(([m, label, short]) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium",
                mode === m ? "bg-surface shadow-sm" : "text-fg-muted",
              )}
            >
              <span className="hidden sm:inline">{label}</span>
              <span className="sm:hidden">{short}</span>
            </button>
          ))}
        </div>

        <Menu
          label="פעולות"
          icon={<Wand2 className="h-4 w-4" />}
          align="start"
          className="md:hidden"
          disabled={bulk.pending}
        >
          {editable ? (
            <>
              <MenuLabel>שיבוץ</MenuLabel>
              {toolItems}
              {mode === "agents" ? (
                <MenuItem
                  icon={<CheckSquare className="h-4 w-4" />}
                  onClick={selectToggle}
                  hint="בחירת כמה נציגים או ימים ושיבוץ של כולם יחד"
                >
                  {selecting ? "סיום בחירה" : "בחירה מרובה"}
                </MenuItem>
              ) : null}
              <MenuSeparator />
            </>
          ) : null}
          {exportItems}
        </Menu>

        {editable ? (
          <>
            <Menu
              className="hidden md:block"
              label="כלי שיבוץ"
              icon={<Wand2 className="h-4 w-4" />}
              align="start"
              disabled={bulk.pending}
            >
              {toolItems}
            </Menu>
            {mode === "agents" ? (
              <Button
                variant={selecting ? "primary" : "secondary"}
                size="sm"
                className={cn(!selecting && "hidden md:inline-flex")}
                onClick={selectToggle}
                title="בחירת כמה נציגים או ימים ושיבוץ של כולם יחד"
              >
                <CheckSquare className="h-4 w-4" />
                {selecting ? "סיום בחירה" : "בחירה מרובה"}
              </Button>
            ) : null}
          </>
        ) : null}

        <div className="ms-auto flex flex-wrap items-center gap-2">
          <Menu
            className="hidden md:block"
            label="ייצוא ושיתוף"
            icon={<Download className="h-4 w-4" />}
          >
            {exportItems}
          </Menu>
          {view.canPublish && (!view.isPast || view.canEditLocked) ? (
            view.week.status === "draft" ? (
              <Button
                size="sm"
                variant="success"
                loading={bulk.pending}
                onClick={() =>
                  bulk.run(() => setWeekStatusAction(view.team.id, view.weekStart, "published"))
                }
              >
                <Send className="h-4 w-4" />
                <span className="hidden sm:inline">פרסום הסידור</span>
                <span className="sm:hidden">פרסום</span>
              </Button>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                loading={bulk.pending}
                onClick={() =>
                  bulk.run(() => setWeekStatusAction(view.team.id, view.weekStart, "draft"))
                }
              >
                <Undo2 className="h-4 w-4" />
                <span className="hidden sm:inline">החזרה לטיוטה</span>
                <span className="sm:hidden">לטיוטה</span>
              </Button>
            )
          ) : null}
        </div>
      </div>

      {view.lockReason && view.lockReason !== "צפייה בלבד" ? (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-fg-muted">
          <Lock className="h-4 w-4" />
          {view.lockReason}
        </div>
      ) : null}
      {view.week.status === "published" && view.week.publishedByName ? (
        <p className="text-xs text-fg-muted">
          פורסם ע״י {view.week.publishedByName}
          {view.week.publishedAt ? ` · ${formatDate(view.week.publishedAt.slice(0, 10))}` : ""}
        </p>
      ) : null}
      {pendingCount > 0 || rejectedCount > 0 ? (
        <div className="flex flex-wrap gap-2 text-sm">
          {pendingCount > 0 ? (
            <Badge tone="warning">{pendingCount} שיבוצים ממתינים לאישור מנהלת המוקד</Badge>
          ) : null}
          {rejectedCount > 0 ? (
            <Badge tone="danger">{rejectedCount} שיבוצים נדחו ודורשים שינוי</Badge>
          ) : null}
        </div>
      ) : null}

      {view.agents.length === 0 ? (
        <Card>
          <EmptyState
            title="אין נציגים בצוות"
            description={
              canViewAgents ? (
                <Link href="/agents" className="text-primary underline">
                  להוספת נציגים
                </Link>
              ) : undefined
            }
          />
        </Card>
      ) : mode === "agents" ? (
        <>
          {selecting ? (
            <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary">
              לחצו על משבצות כדי לבחור אותן. לחיצה על יום בכותרת בוחרת את כל הנציגים באותו יום,
              ולחיצה על שם נציג בוחרת את כל השבוע שלו.
            </p>
          ) : null}
          <AgentsGrid
            view={view}
            catalog={catalog}
            editable={editable}
            entryOf={entryOf}
            usageOf={usageOf}
            onCell={openCell}
            selection={selection}
          />
          <DayList
            view={view}
            catalog={catalog}
            editable={editable}
            entryOf={entryOf}
            usageOf={usageOf}
            onCell={openCell}
            selection={selection}
          />
        </>
      ) : (
        <CoverageTable view={view} catalog={catalog} />
      )}

      <Legend catalog={catalog} />

      {editing ? (
        <CellEditor
          key={`${editing.agent.id}_${editing.date}`}
          target={editing}
          catalog={catalog}
          usage={usageOf(editing.agent.id, editing.date)}
          approval={
            editing.entry?.approvalId ? view.approvals[editing.entry.approvalId] : undefined
          }
          day={view.dayInfo[editing.date]}
          readOnly={!editable}
          onClose={() => setEditing(null)}
          onRangeResult={showResult}
        />
      ) : null}

      {selecting && selected.size > 0 ? (
        <div className="sticky bottom-3 z-20 mx-auto flex w-fit flex-wrap items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 shadow-lg">
          <span className="text-sm font-medium">נבחרו {selected.size} משבצות</span>
          <Button size="sm" onClick={() => setBulkEditing(true)}>
            שיבוץ לנבחרים
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            <X className="h-4 w-4" />
            ניקוי בחירה
          </Button>
        </div>
      ) : null}

      {sharing ? (
        <ShareDialog
          teamId={view.team.id}
          teamName={view.team.name}
          onClose={() => setSharing(false)}
        />
      ) : null}

      {bulkEditing ? (
        <BulkEditor
          cells={selectedCells}
          catalog={catalog}
          agentCount={new Set(selectedCells.map((c) => c.agentId)).size}
          dayCount={new Set(selectedCells.map((c) => c.date)).size}
          onClose={() => setBulkEditing(false)}
          onDone={(data) => {
            endSelection();
            showResult(data);
          }}
        />
      ) : null}

      <Dialog
        open={skipped !== null}
        onClose={() => setSkipped(null)}
        title="חלק מהשיבוצים דולגו"
        footer={<Button onClick={() => setSkipped(null)}>הבנתי</Button>}
      >
        <ul className="space-y-1.5 text-sm">
          {(skipped ?? []).map((s) => {
            const agent = view.agents.find((a) => a.id === s.agentId);
            return (
              <li key={`${s.agentId}_${s.date}`}>
                <strong>{agent ? agentName(agent) : ""}</strong>, {formatDayMonth(s.date)}:{" "}
                {s.reason}
              </li>
            );
          })}
        </ul>
      </Dialog>

      <Dialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="ניקוי השבוע"
        description="כל השיבוצים וההיעדרויות של הצוות בשבוע זה יוסרו. בקשות אישור פתוחות יבוטלו."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmClear(false)}>
              ביטול
            </Button>
            <Button
              variant="danger"
              loading={bulk.pending}
              onClick={() => {
                setConfirmClear(false);
                runBulk(() => clearWeekAction(view.team.id, view.weekStart));
              }}
            >
              ניקוי
            </Button>
          </>
        }
      >
        <p className="text-sm">האם להמשיך?</p>
      </Dialog>
    </div>
  );
}

type ViewAgent = WeekView["agents"][number];

interface Selection {
  active: boolean;
  has: (agentId: string, date: string) => boolean;
  selectable: (agent: ViewAgent, date: string) => boolean;
  toggleColumn: (date: string) => void;
  toggleRow: (agent: ViewAgent) => void;
}

interface GridProps {
  view: WeekView;
  catalog: Catalog;
  editable: boolean;
  entryOf: (agentId: string, date: string) => Assignment | null;
  usageOf: (agentId: string, date: string) => WeekView["quotaUsage"][string][number] | undefined;
  onCell: (agent: ViewAgent, date: string) => void;
  selection: Selection;
}

function DayHeader({ date, today, info }: { date: string; today: string; info?: DayInfo }) {
  return (
    <div className={cn("flex flex-col items-center", date === today && "text-primary")}>
      <span className="text-sm font-semibold">{WEEKDAY_NAMES[weekdayOf(date)]}</span>
      <span className="text-xs text-fg-muted">{formatDayMonth(date)}</span>
      <HolidayTag info={info} />
    </div>
  );
}

/** Holiday name under the date: red for a closed day, amber for an eve, grey otherwise. */
function HolidayTag({ info }: { info?: DayInfo }) {
  if (!info?.name && info?.kind !== "closed" && info?.kind !== "eve") return null;
  const label =
    info.kind === "closed"
      ? `${info.name ?? "חג"} · סגור`
      : info.kind === "eve"
        ? `${info.name ?? "ערב חג"} · כמו שישי`
        : info.name;
  return (
    <span
      className={cn(
        "mt-0.5 max-w-28 truncate text-[11px] font-medium",
        info.kind === "closed" && "text-danger",
        info.kind === "eve" && "text-warning",
        info.kind === "regular" && "text-fg-muted",
      )}
      title={label ?? undefined}
    >
      {label}
    </span>
  );
}

function AgentsGrid({ view, catalog, editable, entryOf, usageOf, onCell, selection }: GridProps) {
  return (
    <Card className="hidden overflow-hidden md:block">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky start-0 z-10 min-w-48 border-b border-e border-border bg-muted px-3 py-2 text-start text-xs font-semibold text-fg-muted">
                נציג
              </th>
              {view.days.map((d) => (
                <th
                  key={d}
                  className={cn(
                    "min-w-28 border-b border-border px-2 py-2",
                    d === view.today ? "bg-primary/10" : "bg-muted",
                  )}
                >
                  {selection.active ? (
                    <button
                      type="button"
                      onClick={() => selection.toggleColumn(d)}
                      className="w-full rounded-md hover:bg-surface"
                      title="בחירת כל הנציגים ביום זה"
                    >
                      <DayHeader date={d} today={view.today} info={view.dayInfo[d]} />
                    </button>
                  ) : (
                    <DayHeader date={d} today={view.today} info={view.dayInfo[d]} />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.agents.map((agent) => (
              <tr
                key={agent.id}
                className={cn(!agent.isActive || !agent.inTeam ? "opacity-60" : "")}
              >
                <th className="sticky start-0 z-10 border-b border-e border-border bg-surface px-3 py-2 text-start font-normal">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      {selection.active ? (
                        <button
                          type="button"
                          onClick={() => selection.toggleRow(agent)}
                          className="truncate font-medium text-primary hover:underline"
                          title="בחירת כל השבוע של הנציג"
                        >
                          {agentName(agent)}
                        </button>
                      ) : (
                        <p className="truncate font-medium">{agentName(agent)}</p>
                      )}
                      <p className="text-xs text-fg-subtle">
                        {[
                          agent.employeeNumber,
                          !agent.isActive ? "לא פעיל" : !agent.inTeam ? "עבר צוות" : "",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <QuotaSummaryBadge usages={view.quotaUsage[agent.id]} />
                  </div>
                </th>
                {view.days.map((date) => {
                  const entry = entryOf(agent.id, date);
                  const closed = view.dayInfo[date]?.kind === "closed";
                  const clickable = selection.active
                    ? selection.selectable(agent, date)
                    : entry || (editable && agent.isActive && agent.inTeam && !closed);
                  const isSelected = selection.active && selection.has(agent.id, date);
                  return (
                    <td
                      key={date}
                      className={cn(
                        "border-b border-border p-1.5 text-center align-middle",
                        date === view.today && "bg-primary/5",
                        closed && "bg-muted/60",
                        isSelected &&
                          "bg-primary/15 outline outline-2 -outline-offset-2 outline-primary",
                      )}
                    >
                      {clickable ? (
                        <button
                          type="button"
                          onClick={() => onCell(agent, date)}
                          className="group flex min-h-11 w-full items-center justify-center rounded-lg hover:bg-muted"
                          aria-label={`${agentName(agent)} ${formatDayMonth(date)}`}
                          title={usageOf(agent.id, date) ? undefined : undefined}
                        >
                          {entry ? (
                            <EntryChip entry={entry} catalog={catalog} />
                          ) : (
                            <Plus className="h-4 w-4 text-fg-subtle opacity-0 group-hover:opacity-100" />
                          )}
                        </button>
                      ) : (
                        <div className="min-h-11" />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <CoverageFooter view={view} catalog={catalog} />
          </tfoot>
        </table>
      </div>
    </Card>
  );
}

/** Count of agents per day covering morning/evening. */
function coverageFor(view: WeekView, catalog: Catalog, date: string) {
  let morning = 0;
  let evening = 0;
  let absent = 0;
  for (const agent of view.agents) {
    const entry = view.assignments[assignmentId(agent.id, date)];
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

function CoverageFooter({ view, catalog }: { view: WeekView; catalog: Catalog }) {
  return (
    <tr className="bg-muted/60">
      <th className="sticky start-0 z-10 border-e border-border bg-muted px-3 py-2 text-start text-xs font-semibold text-fg-muted">
        סה״כ ביום
      </th>
      {view.days.map((date) => {
        const c = coverageFor(view, catalog, date);
        if (view.dayInfo[date]?.kind === "closed" && c.morning + c.evening + c.absent === 0) {
          return (
            <td key={date} className="px-2 py-2 text-center text-xs text-fg-muted">
              סגור
            </td>
          );
        }
        return (
          <td key={date} className="px-2 py-2 text-center text-xs text-fg-muted">
            <div>
              בוקר: <strong className="text-fg">{c.morning}</strong>
            </div>
            {shiftWeekday(date, view.dayInfo[date]) !== 5 ? (
              <div>
                ערב: <strong className="text-fg">{c.evening}</strong>
              </div>
            ) : null}
            {c.absent > 0 ? <div>נעדרים: {c.absent}</div> : null}
          </td>
        );
      })}
    </tr>
  );
}

/** Mobile: one day at a time. */
function DayList({ view, catalog, editable, entryOf, usageOf, onCell, selection }: GridProps) {
  const initial = view.days.includes(view.today) ? view.today : view.days[0];
  const [day, setDay] = useState(initial);
  const c = coverageFor(view, catalog, day);
  return (
    <div className="space-y-3 md:hidden">
      <div className="sticky top-13 z-20 -mx-4 flex gap-1.5 overflow-x-auto bg-bg/95 px-4 py-2 backdrop-blur">
        {view.days.map((d) => (
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
            {view.dayInfo[d] && view.dayInfo[d].kind !== "regular" ? (
              <span
                className={cn(
                  "mt-0.5 h-1.5 w-1.5 rounded-full",
                  view.dayInfo[d].kind === "closed" ? "bg-danger" : "bg-warning",
                )}
              />
            ) : null}
          </button>
        ))}
      </div>
      <HolidayTag info={view.dayInfo[day]} />
      {selection.active ? (
        <Button size="sm" variant="secondary" onClick={() => selection.toggleColumn(day)}>
          <CheckSquare className="h-4 w-4" />
          בחירת כל הנציגים ביום זה
        </Button>
      ) : null}
      <p className="text-xs text-fg-muted">
        בוקר: {c.morning}
        {shiftWeekday(day, view.dayInfo[day]) !== 5 ? ` · ערב: ${c.evening}` : ""}
        {c.absent ? ` · נעדרים: ${c.absent}` : ""}
      </p>
      <Card className="divide-y divide-border">
        {view.agents.map((agent) => {
          const entry = entryOf(agent.id, day);
          const clickable = selection.active
            ? selection.selectable(agent, day)
            : entry ||
              (editable && agent.isActive && agent.inTeam && view.dayInfo[day]?.kind !== "closed");
          const isSelected = selection.active && selection.has(agent.id, day);
          return (
            <button
              key={agent.id}
              type="button"
              disabled={!clickable}
              onClick={() => onCell(agent, day)}
              className={cn(
                "flex w-full items-center gap-3 px-3 py-2.5 text-start disabled:opacity-60",
                isSelected && "bg-primary/15",
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{agentName(agent)}</p>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-fg-subtle">
                  {agent.employeeNumber}
                  <QuotaBadge usage={usageOf(agent.id, day)} />
                </div>
              </div>
              <div className="w-28 shrink-0">
                {entry ? (
                  <EntryChip entry={entry} catalog={catalog} />
                ) : clickable ? (
                  <div className="flex h-10 items-center justify-center rounded-lg border border-dashed border-border text-fg-subtle">
                    <Plus className="h-4 w-4" />
                  </div>
                ) : null}
              </div>
            </button>
          );
        })}
      </Card>
    </div>
  );
}

function CoverageTable({ view, catalog }: { view: WeekView; catalog: Catalog }) {
  const shifts = catalog.shifts.filter((s) => s.isActive);
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky start-0 z-10 min-w-28 border-b border-e border-border bg-muted px-3 py-2 text-start text-xs font-semibold text-fg-muted">
                משמרת
              </th>
              {view.days.map((d) => (
                <th key={d} className="min-w-36 border-b border-border bg-muted px-2 py-2">
                  <DayHeader date={d} today={view.today} info={view.dayInfo[d]} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shifts.map((shift) => (
              <tr key={shift.id}>
                <th className="sticky start-0 z-10 border-b border-e border-border bg-surface px-3 py-2 text-start">
                  <span className="font-semibold" style={{ color: shift.color }}>
                    {shift.name}
                  </span>
                  {shift.requiredAgents ? (
                    <p className="text-xs font-normal text-fg-muted">
                      נדרשים: {shift.requiredAgents}
                    </p>
                  ) : null}
                </th>
                {view.days.map((date) => {
                  if (!shiftRunsOn(shift, date, view.dayInfo[date])) {
                    return <td key={date} className="border-b border-border bg-muted/40" />;
                  }
                  const people = view.agents.filter(
                    (a) => view.assignments[assignmentId(a.id, date)]?.shiftId === shift.id,
                  );
                  const short =
                    shift.requiredAgents !== null && people.length < shift.requiredAgents;
                  return (
                    <td key={date} className="border-b border-border px-2 py-2 align-top">
                      <p
                        className={cn(
                          "mb-1 text-xs font-semibold",
                          short ? "text-danger" : "text-fg-muted",
                        )}
                      >
                        {people.length}
                        {shift.requiredAgents !== null ? ` / ${shift.requiredAgents}` : ""} נציגים
                      </p>
                      <ul className="space-y-0.5 text-xs">
                        {people.map((a) => {
                          const e = view.assignments[assignmentId(a.id, date)];
                          const loc = catalog.locations.find((l) => l.id === e.locationId);
                          return (
                            <li
                              key={a.id}
                              className={cn(
                                e.quotaStatus === "rejected" && "line-through opacity-60",
                              )}
                            >
                              {agentName(a)}
                              {loc?.requiresQuota ? (
                                <span className="text-fg-muted"> ({loc.name})</span>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Legend({ catalog }: { catalog: Catalog }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-fg-muted">
      {catalog.shifts
        .filter((s) => s.isActive)
        .map((s) => (
          <span key={s.id} className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded" style={{ backgroundColor: s.color }} />
            {s.name}
          </span>
        ))}
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded ring-2 ring-warning" /> ממתין לאישור
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded ring-2 ring-danger" /> נדחה
      </span>
    </div>
  );
}
