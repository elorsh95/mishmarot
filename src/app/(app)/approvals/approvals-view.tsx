"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, Check, Home, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/page-header";
import { useToast } from "@/components/ui/toast";
import { useAction } from "@/components/ui/use-action";
import { cn } from "@/lib/cn";
import { formatDateTime, formatDateWithDay, formatDayMonth, formatMonth } from "@/lib/dates";
import { APPROVAL_STATUS_LABELS, type ApprovalListItem } from "@/modules/approvals/types";
import type { Catalog } from "@/modules/catalog/service";
import { approveManyAction, decideAction } from "./actions";

export function ApprovalsView({
  items,
  tab,
  teams,
  teamId,
  month,
  catalog,
  canDecide,
}: {
  items: ApprovalListItem[];
  tab: "pending" | "decided";
  teams: Array<{ id: string; name: string }>;
  teamId: string;
  month: string;
  catalog: Catalog;
  canDecide: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [rejecting, setRejecting] = useState<ApprovalListItem | null>(null);
  const action = useAction();
  const toast = useToast();
  const teamName = (id: string) => teams.find((t) => t.id === id)?.name ?? "";

  function setFilter(key: string, value: string) {
    const params = new URLSearchParams({ tab });
    if (teamId) params.set("team", teamId);
    if (month) params.set("month", month);
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`/approvals?${params}`);
  }

  function approve(id: string) {
    action.run(() => decideAction({ approvalId: id, decision: "approved" }), {
      onSuccess: () => setSelected((s) => s.filter((x) => x !== id)),
    });
  }

  function approveSelected() {
    action.run(() => approveManyAction(selected), {
      onSuccess: (r) => {
        setSelected([]);
        if (r.approved > 0) toast.success(`אושרו ${r.approved} בקשות`);
        if (r.failed.length > 0) {
          toast.error(
            `${r.failed.length} בקשות לא אושרו:\n${r.failed.map((f) => f.error).join("\n")}`,
          );
        }
      },
    });
  }

  const urgent = items.filter((i) => i.urgent).length;
  const tabHref = (t: string) => {
    const params = new URLSearchParams({ tab: t });
    if (teamId) params.set("team", teamId);
    if (month) params.set("month", month);
    return `/approvals?${params}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="inline-flex rounded-lg border border-border bg-muted p-0.5">
          {(
            [
              ["pending", "ממתינות"],
              ["decided", "טופלו"],
            ] as const
          ).map(([t, label]) => (
            <Link
              key={t}
              href={tabHref(t)}
              className={cn(
                "rounded-md px-4 py-1.5 text-sm font-medium",
                tab === t ? "bg-surface shadow-sm" : "text-fg-muted",
              )}
            >
              {label}
            </Link>
          ))}
        </div>
        {teams.length > 1 ? (
          <Select
            aria-label="צוות"
            value={teamId}
            onChange={(e) => setFilter("team", e.target.value)}
            className="h-9 w-auto min-w-36"
          >
            <option value="">כל הצוותים</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        ) : null}
        <Input
          type="month"
          aria-label="חודש"
          value={month}
          onChange={(e) => setFilter("month", e.target.value)}
          className="h-9 w-auto"
        />
        {tab === "pending" && canDecide && items.length > 0 ? (
          <div className="ms-auto flex items-center gap-2">
            <Checkbox
              label="סימון הכל"
              checked={selected.length === items.length}
              onChange={(e) => setSelected(e.target.checked ? items.map((i) => i.id) : [])}
            />
            <Button
              size="sm"
              variant="success"
              disabled={selected.length === 0}
              loading={action.pending}
              onClick={approveSelected}
            >
              <Check className="h-4 w-4" />
              אישור המסומנים ({selected.length})
            </Button>
          </div>
        ) : null}
      </div>

      {tab === "pending" && urgent > 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
          <AlertTriangle className="h-4 w-4" />
          {urgent} בקשות שהתאריך שלהן כבר הגיע ועדיין לא טופלו
        </div>
      ) : null}

      {items.length === 0 ? (
        <Card>
          <EmptyState
            title={tab === "pending" ? "אין בקשות ממתינות" : "אין בקשות שטופלו"}
            description={tab === "pending" ? "כל הבקשות טופלו 🎉" : undefined}
          />
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {items.map((item) => {
            const shift = catalog.shifts.find((s) => s.id === item.shiftId);
            const location = catalog.locations.find((l) => l.id === item.locationId);
            return (
              <Card
                key={item.id}
                className={cn("p-4", item.urgent && "border-danger/50 ring-1 ring-danger/30")}
              >
                <div className="flex items-start gap-3">
                  {tab === "pending" && canDecide ? (
                    <input
                      type="checkbox"
                      aria-label="סימון"
                      className="mt-1 h-4 w-4 accent-primary"
                      checked={selected.includes(item.id)}
                      onChange={(e) =>
                        setSelected((s) =>
                          e.target.checked ? [...s, item.id] : s.filter((x) => x !== item.id),
                        )
                      }
                    />
                  ) : null}
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{item.agentName}</p>
                      <span className="text-xs text-fg-subtle">{item.employeeNumber}</span>
                      <Badge tone="primary">{teamName(item.teamId)}</Badge>
                      {item.urgent ? <Badge tone="danger">התאריך הגיע</Badge> : null}
                      {tab === "decided" ? (
                        <Badge tone={item.status === "approved" ? "success" : "danger"}>
                          {APPROVAL_STATUS_LABELS[item.status]}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-sm">
                      <strong>{formatDateWithDay(item.date)}</strong> · {shift?.name ?? ""} ·{" "}
                      <span className="inline-flex items-center gap-1 font-medium">
                        <Home className="h-3.5 w-3.5" />
                        {location?.name ?? ""}
                      </span>
                    </p>
                    <p className="text-sm text-fg-muted">
                      הפעם ה-<strong className="text-fg">{item.position}</strong> ב
                      {formatMonth(item.month)} (מכסה: {item.quota})
                    </p>
                    {item.monthQuotaDates.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {item.monthQuotaDates.map((d) => (
                          <span
                            key={d}
                            className={cn(
                              "rounded-md border px-1.5 py-0.5 text-xs",
                              d === item.date
                                ? "border-warning bg-warning/15 font-semibold"
                                : "border-border bg-muted text-fg-muted",
                            )}
                          >
                            {formatDayMonth(d)}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <p className="text-xs text-fg-subtle">
                      נשלח ע״י {item.requestedByName} · {formatDateTime(item.createdAt)}
                    </p>
                    {tab === "decided" ? (
                      <p className="text-sm text-fg-muted">
                        {item.status === "approved" ? "אושר" : "נדחה"} ע״י {item.decidedByName}
                        {item.decidedAt ? ` · ${formatDateTime(item.decidedAt)}` : ""}
                        {item.decisionNote ? (
                          <span className="block text-fg">הערה: {item.decisionNote}</span>
                        ) : null}
                      </p>
                    ) : null}
                  </div>
                </div>
                {tab === "pending" && canDecide ? (
                  <div className="mt-3 flex justify-end gap-2 border-t border-border pt-3">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="text-danger"
                      disabled={action.pending}
                      onClick={() => setRejecting(item)}
                    >
                      <X className="h-4 w-4" />
                      דחייה
                    </Button>
                    <Button
                      size="sm"
                      variant="success"
                      disabled={action.pending}
                      onClick={() => approve(item.id)}
                    >
                      <Check className="h-4 w-4" />
                      אישור
                    </Button>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}

      {rejecting ? <RejectDialog item={rejecting} onClose={() => setRejecting(null)} /> : null}
    </div>
  );
}

function RejectDialog({ item, onClose }: { item: ApprovalListItem; onClose: () => void }) {
  const [note, setNote] = useState("");
  const { run, pending, fieldErrors } = useAction();
  return (
    <Dialog
      open
      onClose={onClose}
      title="דחיית בקשה"
      description={`${item.agentName} · ${formatDateWithDay(item.date)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            ביטול
          </Button>
          <Button
            variant="danger"
            loading={pending}
            onClick={() =>
              run(() => decideAction({ approvalId: item.id, decision: "rejected", note }), {
                onSuccess: onClose,
              })
            }
          >
            דחייה
          </Button>
        </>
      }
    >
      <Field
        label="סיבת הדחייה"
        htmlFor="reject-note"
        error={fieldErrors.note}
        hint="ההערה תוצג למנהל הצוות"
      >
        <Textarea
          id="reject-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          autoFocus
          maxLength={500}
        />
      </Field>
    </Dialog>
  );
}
