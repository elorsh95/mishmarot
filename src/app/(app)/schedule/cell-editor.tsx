"use client";

import { useState } from "react";
import { AlertTriangle, ChevronDown, History, Home } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, Spinner } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, FormError, Input } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { useAction } from "@/components/ui/use-action";
import { cn } from "@/lib/cn";
import { formatDateTime, formatDateWithDay, formatMonth, monthOf } from "@/lib/dates";
import { agentName, type Agent } from "@/modules/agents/types";
import { shiftRunsOn, type DayInfo } from "@/modules/calendar/types";
import type { Catalog } from "@/modules/catalog/service";
import type { ApprovalInfo, QuotaUsage } from "@/modules/schedule/service";
import {
  QUOTA_STATUS_LABELS,
  type Assignment,
  type CellHistoryItem,
} from "@/modules/schedule/types";
import type { SkippedOp } from "@/modules/schedule/engine";
import { cellHistoryAction, setAbsenceRangeAction, setEntryAction } from "./actions";
import { tint } from "./entry-chip";

export interface EditTarget {
  agent: Agent;
  date: string;
  entry: Assignment | null;
}

export function CellEditor({
  target,
  catalog,
  usage,
  approval,
  day,
  readOnly: readOnlyProp,
  onClose,
  onRangeResult,
}: {
  target: EditTarget;
  catalog: Catalog;
  usage: QuotaUsage | undefined;
  approval: ApprovalInfo | undefined;
  /** Holiday or eve on this date, if any. */
  day: DayInfo | undefined;
  readOnly: boolean;
  onClose: () => void;
  /** Called after an absence range was saved, with the summary and any skipped days. */
  onRangeResult: (result: {
    summary: string;
    skipped: SkippedOp[];
    undoToken?: string | null;
  }) => void;
}) {
  const { agent, date, entry } = target;
  const closed = day?.kind === "closed";
  // On a closed day an existing entry can only be removed.
  const readOnly = readOnlyProp || (closed && !entry);
  const shifts = catalog.shifts.filter(
    (s) => (s.isActive && shiftRunsOn(s, date, day)) || s.id === entry?.shiftId,
  );
  const locations = catalog.locations.filter((l) => l.isActive || l.id === entry?.locationId);
  const absences = catalog.absenceTypes.filter((a) => a.isActive || a.id === entry?.absenceTypeId);

  const defaultLocation =
    entry?.locationId ??
    (agent.defaultLocationId && locations.some((l) => l.id === agent.defaultLocationId)
      ? agent.defaultLocationId
      : locations.find((l) => !l.requiresQuota)?.id) ??
    "";

  const [kind, setKind] = useState<"shift" | "absence">(entry?.kind ?? "shift");
  const [shiftId, setShiftId] = useState(
    entry?.shiftId ??
      (shifts.some((s) => s.id === agent.defaultShiftId) ? agent.defaultShiftId! : shifts[0]?.id) ??
      "",
  );
  const [locationId, setLocationId] = useState(defaultLocation);
  const [absenceTypeId, setAbsenceTypeId] = useState(entry?.absenceTypeId ?? absences[0]?.id ?? "");
  const [note, setNote] = useState(entry?.note ?? "");
  // Absence for a range: from this date up to rangeEnd (inclusive).
  const [rangeEnd, setRangeEnd] = useState("");
  const [workDaysOnly, setWorkDaysOnly] = useState(true);
  const isRange = kind === "absence" && rangeEnd !== "" && rangeEnd > date;
  const { run, pending, error } = useAction();
  const toast = useToast();

  const selectedLocation = locations.find((l) => l.id === locationId);
  const isNewQuotaDay =
    kind === "shift" &&
    selectedLocation?.requiresQuota &&
    !(entry?.locationId === locationId && entry.quotaStatus !== "none");
  const willNeedApproval = isNewQuotaDay && usage && usage.used >= usage.quota;

  function save() {
    if (isRange) {
      run(
        () =>
          setAbsenceRangeAction(
            agent.id,
            date,
            rangeEnd,
            { kind, absenceTypeId, note },
            workDaysOnly,
          ),
        {
          onSuccess: (data) => {
            onClose();
            onRangeResult(data);
          },
        },
      );
      return;
    }
    const payload =
      kind === "shift" ? { kind, shiftId, locationId, note } : { kind, absenceTypeId, note };
    run(() => setEntryAction(agent.id, date, payload), {
      onSuccess: (data) => {
        if (data.pending) toast.info("השיבוץ ממתין לאישור מנהלת המוקד");
        onClose();
      },
      success: "השיבוץ נשמר",
    });
  }

  function clear() {
    run(() => setEntryAction(agent.id, date, null), { success: "השיבוץ הוסר", onSuccess: onClose });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={agentName(agent)}
      description={formatDateWithDay(date)}
      footer={
        readOnly ? (
          <Button variant="secondary" onClick={onClose}>
            סגירה
          </Button>
        ) : (
          <>
            {entry ? (
              <Button
                variant="ghost"
                className="me-auto text-danger"
                onClick={clear}
                disabled={pending}
              >
                הסרת שיבוץ
              </Button>
            ) : null}
            <Button variant="secondary" onClick={onClose} disabled={pending}>
              ביטול
            </Button>
            {closed ? null : (
              <Button onClick={save} loading={pending}>
                שמירה
              </Button>
            )}
          </>
        )
      }
    >
      <div className="space-y-4">
        <FormError error={error} />

        {day && day.kind !== "regular" ? (
          <div
            className={cn(
              "rounded-lg border px-3 py-2 text-sm",
              closed ? "border-danger/30 bg-danger/10" : "border-warning/40 bg-warning/10",
            )}
          >
            <p className="font-semibold">{day.name ?? (closed ? "חג" : "ערב חג")}</p>
            <p className="text-fg-muted">
              {closed
                ? "המוקד סגור ביום זה ולא ניתן לשבץ. אפשר רק להסיר שיבוץ קיים."
                : "ערב חג: אפשר לשבץ רק למשמרות של יום שישי."}
            </p>
          </div>
        ) : null}

        {entry && entry.quotaStatus !== "none" && entry.quotaStatus !== "within_quota" ? (
          <div
            className={cn(
              "rounded-lg border px-3 py-2 text-sm",
              entry.quotaStatus === "pending" && "border-warning/40 bg-warning/10",
              entry.quotaStatus === "approved" && "border-success/30 bg-success/10",
              entry.quotaStatus === "rejected" && "border-danger/30 bg-danger/10",
            )}
          >
            <p className="font-semibold">{QUOTA_STATUS_LABELS[entry.quotaStatus]}</p>
            {approval?.decidedByName ? (
              <p className="text-fg-muted">
                {entry.quotaStatus === "approved" ? "אושר" : "נדחה"} ע״י {approval.decidedByName}
                {approval.decisionNote ? `: ${approval.decisionNote}` : ""}
              </p>
            ) : null}
            {entry.quotaStatus === "rejected" ? (
              <p className="mt-1 text-fg-muted">יש לשנות את מיקום העבודה או להסיר את השיבוץ.</p>
            ) : null}
          </div>
        ) : null}

        <div className="inline-flex rounded-lg border border-border bg-muted p-0.5">
          {(["shift", "absence"] as const).map((k) => (
            <button
              key={k}
              type="button"
              disabled={readOnly}
              onClick={() => setKind(k)}
              className={cn(
                "rounded-md px-4 py-1.5 text-sm font-medium",
                kind === k ? "bg-surface shadow-sm" : "text-fg-muted",
              )}
            >
              {k === "shift" ? "משמרת" : "היעדרות"}
            </button>
          ))}
        </div>

        {kind === "shift" ? (
          <>
            <Field label="משמרת">
              {shifts.length === 0 ? (
                <p className="text-sm text-fg-muted">אין משמרות ביום זה</p>
              ) : (
                <ChoiceGroup
                  disabled={readOnly}
                  value={shiftId}
                  onChange={setShiftId}
                  options={shifts.map((s) => ({ id: s.id, label: s.name, color: s.color }))}
                />
              )}
            </Field>
            <Field label="מיקום עבודה">
              <ChoiceGroup
                disabled={readOnly}
                value={locationId}
                onChange={setLocationId}
                options={locations.map((l) => ({
                  id: l.id,
                  label: l.name,
                  color: l.color,
                  icon: l.requiresQuota,
                }))}
              />
            </Field>
            {usage && selectedLocation?.requiresQuota ? (
              <div
                className={cn(
                  "flex items-start gap-2 rounded-lg px-3 py-2 text-sm",
                  willNeedApproval ? "bg-warning/10 text-warning-fg" : "bg-muted text-fg-muted",
                )}
              >
                {willNeedApproval ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : null}
                <span>
                  {usage.period === "week" ? "בשבוע זה" : `ב${formatMonth(monthOf(date))}`}{" "}
                  {agent.firstName} שובץ/ה ב{selectedLocation.name} <strong>{usage.used}</strong>{" "}
                  מתוך {usage.quota} ימים.
                  {willNeedApproval ? " שיבוץ זה יישלח לאישור מנהלת המוקד." : ""}
                </span>
              </div>
            ) : null}
          </>
        ) : (
          <Field label="סוג היעדרות">
            <ChoiceGroup
              disabled={readOnly}
              value={absenceTypeId}
              onChange={setAbsenceTypeId}
              options={absences.map((a) => ({ id: a.id, label: a.name, color: a.color }))}
            />
          </Field>
        )}

        {kind === "absence" && !readOnly ? (
          <div className="space-y-2 rounded-lg border border-border p-3">
            <Field
              label="עד תאריך (לא חובה)"
              htmlFor="range-end"
              hint="למשל חופשה של כמה ימים: אותה היעדרות תירשם בכל הימים עד התאריך הזה. חגים ושבתות מדולגים."
            >
              <Input
                id="range-end"
                type="date"
                min={date}
                value={rangeEnd}
                onChange={(e) => setRangeEnd(e.target.value)}
                className="max-w-48"
              />
            </Field>
            {isRange ? (
              <Checkbox
                label={`רק בימי העבודה הקבועים של ${agent.firstName}`}
                checked={workDaysOnly}
                onChange={(e) => setWorkDaysOnly(e.target.checked)}
              />
            ) : null}
          </div>
        ) : null}

        <Field label="הערה" htmlFor="note">
          <Input
            id="note"
            value={note}
            disabled={readOnly}
            maxLength={300}
            onChange={(e) => setNote(e.target.value)}
            placeholder="אופציונלי"
          />
        </Field>

        <CellHistory agentId={agent.id} date={date} />
      </div>
    </Dialog>
  );
}

/** Who changed this cell and when, loaded on request from the audit log. */
function CellHistory({ agentId, date }: { agentId: string; date: string }) {
  const [items, setItems] = useState<CellHistoryItem[] | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && items === null) {
      setLoading(true);
      const result = await cellHistoryAction(agentId, date);
      setItems(result.ok ? result.data : []);
      setLoading(false);
    }
  }

  return (
    <div className="border-t border-border pt-3">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-sm font-medium text-fg-muted hover:text-fg"
      >
        <History className="h-4 w-4" />
        היסטוריית שינויים
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        loading ? (
          <Spinner className="mt-2 text-fg-muted" />
        ) : items && items.length > 0 ? (
          <ol className="mt-2 max-h-56 space-y-2 overflow-y-auto">
            {items.map((item) => (
              <li key={item.id} className="border-s-2 border-border ps-3 text-xs">
                <p className="text-fg">{item.summary}</p>
                <p className="text-fg-subtle">
                  {item.actorName} · {formatDateTime(item.createdAt)}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-xs text-fg-muted">אין שינויים רשומים למשבצת הזו.</p>
        )
      ) : null}
    </div>
  );
}

export function ChoiceGroup({
  options,
  value,
  onChange,
  disabled,
}: {
  options: Array<{ id: string; label: string; color: string; icon?: boolean }>;
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup">
      {options.map((o) => {
        const selected = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(o.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm font-medium transition",
              selected ? "shadow-sm" : "border-border bg-surface text-fg-muted hover:bg-muted",
            )}
            style={
              selected
                ? { backgroundColor: tint(o.color, "1f"), borderColor: o.color, color: o.color }
                : undefined
            }
          >
            {o.icon ? <Home className="h-3.5 w-3.5" /> : null}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const usageTitle = (u: QuotaUsage) =>
  `${u.period === "week" ? "ימי בית בשבוע זה" : `ימי בית ב${formatMonth(u.key)}`}: ${u.used} מתוך ${u.quota}`;

/**
 * The quota usage worth showing when a week spans two months: the fuller one (over the quota
 * first), with every period in the tooltip.
 */
export function QuotaSummaryBadge({ usages }: { usages: QuotaUsage[] | undefined }) {
  if (!usages?.length) return null;
  const ratio = (u: QuotaUsage) => (u.quota > 0 ? u.used / u.quota : u.used > 0 ? Infinity : 0);
  const top = usages.reduce((a, b) => (ratio(b) > ratio(a) ? b : a));
  return (
    <QuotaBadge
      usage={top}
      showLabel={usages.length > 1}
      title={usages.map(usageTitle).join("\n")}
    />
  );
}

export function QuotaBadge({
  usage,
  showLabel = false,
  title,
}: {
  usage: QuotaUsage | undefined;
  showLabel?: boolean;
  title?: string;
}) {
  if (!usage) return null;
  const over = usage.used > usage.quota;
  const full = usage.used === usage.quota;
  return (
    <Badge tone={over ? "danger" : full ? "warning" : "neutral"} title={title ?? usageTitle(usage)}>
      <Home className="h-3 w-3" />
      {showLabel ? <span className="font-normal">{usage.label}</span> : null}
      <span dir="ltr">
        {usage.used}/{usage.quota}
      </span>
    </Badge>
  );
}
