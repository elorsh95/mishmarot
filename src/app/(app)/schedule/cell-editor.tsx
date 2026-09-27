"use client";

import { useState } from "react";
import { AlertTriangle, Home } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, Input } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { useAction } from "@/components/ui/use-action";
import { cn } from "@/lib/cn";
import { formatDateWithDay, formatMonth, MONTH_NAMES, monthOf } from "@/lib/dates";
import { agentName, type Agent } from "@/modules/agents/types";
import { shiftRunsOn, type DayInfo } from "@/modules/calendar/types";
import type { Catalog } from "@/modules/catalog/service";
import type { ApprovalInfo, QuotaUsage } from "@/modules/schedule/service";
import { QUOTA_STATUS_LABELS, type Assignment } from "@/modules/schedule/types";
import { setEntryAction } from "./actions";
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
}: {
  target: EditTarget;
  catalog: Catalog;
  usage: QuotaUsage | undefined;
  approval: ApprovalInfo | undefined;
  /** Holiday or eve on this date, if any. */
  day: DayInfo | undefined;
  readOnly: boolean;
  onClose: () => void;
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
  const { run, pending, error } = useAction();
  const toast = useToast();

  const selectedLocation = locations.find((l) => l.id === locationId);
  const isNewQuotaDay =
    kind === "shift" &&
    selectedLocation?.requiresQuota &&
    !(entry?.locationId === locationId && entry.quotaStatus !== "none");
  const willNeedApproval = isNewQuotaDay && usage && usage.used >= usage.quota;

  function save() {
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
                  ב{formatMonth(monthOf(date))} {agent.firstName} שובץ/ה ב{selectedLocation.name}{" "}
                  <strong>{usage.used}</strong> מתוך {usage.quota} ימים.
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
      </div>
    </Dialog>
  );
}

function ChoiceGroup({
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

export function QuotaBadge({
  usage,
  showMonth = false,
}: {
  usage: QuotaUsage | undefined;
  showMonth?: boolean;
}) {
  if (!usage) return null;
  const over = usage.used > usage.quota;
  const full = usage.used === usage.quota;
  return (
    <Badge
      tone={over ? "danger" : full ? "warning" : "neutral"}
      title={`ימי בית ב${formatMonth(usage.month)}`}
    >
      <Home className="h-3 w-3" />
      {showMonth ? (
        <span className="font-normal">{MONTH_NAMES[Number(usage.month.slice(5)) - 1]}</span>
      ) : null}
      <span dir="ltr">
        {usage.used}/{usage.quota}
      </span>
    </Badge>
  );
}
