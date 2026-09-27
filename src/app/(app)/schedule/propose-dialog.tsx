"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Info, Sparkles } from "lucide-react";
import { Button, Spinner } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, FormError } from "@/components/ui/form";
import { Table, Td, Th } from "@/components/ui/table";
import { useAction } from "@/components/ui/use-action";
import { cn } from "@/lib/cn";
import { formatDayMonth, WEEKDAY_SHORT, weekdayOf } from "@/lib/dates";
import { REASON_LABELS, type Proposal } from "@/modules/autoschedule/types";
import type { Catalog } from "@/modules/catalog/service";
import type { SkippedOp } from "@/modules/schedule/engine";
import { applyProposalAction, proposeWeekAction } from "./actions";
import { tint } from "./entry-chip";

type BulkResult = { summary: string; skipped: SkippedOp[]; undoToken?: string | null };

/**
 * "הצע סידור": a proposal for the week's empty cells (usual days and shifts, the team's
 * minimums, the home quota and a fair share of evenings and Fridays), to review and apply.
 */
export function ProposeDialog({
  teamId,
  weekStart,
  weekLabel,
  hasMinimum,
  catalog,
  agentNames,
  onApplied,
  onClose,
}: {
  teamId: string;
  weekStart: string;
  weekLabel: string;
  /** The team has a staffing minimum (the Friday rotation needs one). */
  hasMinimum: boolean;
  catalog: Catalog;
  agentNames: Record<string, string>;
  onApplied: (result: BulkResult) => void;
  onClose: () => void;
}) {
  const [fridayRotation, setFridayRotation] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { run, pending, error } = useAction();

  useEffect(() => {
    let cancelled = false;
    void proposeWeekAction(teamId, weekStart, { fridayRotation }).then((r) => {
      if (cancelled) return;
      if (r.ok) {
        setProposal(r.data);
        setLoadError(null);
      } else {
        setProposal(null);
        setLoadError(r.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [teamId, weekStart, fridayRotation]);

  const shiftOf = (id: string) => catalog.shifts.find((s) => s.id === id);
  const locationOf = (id: string) => catalog.locations.find((l) => l.id === id);

  const byAgent = useMemo(() => {
    const map = new Map<string, Proposal["entries"]>();
    for (const e of proposal?.entries ?? []) map.set(e.agentId, [...(map.get(e.agentId) ?? []), e]);
    return [...map.entries()].sort(([a], [b]) =>
      (agentNames[a] ?? "").localeCompare(agentNames[b] ?? "", "he"),
    );
  }, [proposal, agentNames]);

  const loading = !proposal && !loadError;
  const count = proposal?.entries.length ?? 0;

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={
        <span className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          הצעת סידור
        </span>
      }
      description={`שבוע ${weekLabel}. ממלא רק משבצות ריקות. אפשר לבטל אחרי ההחלה, ולתקן כל משבצת ידנית.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            ביטול
          </Button>
          <Button
            loading={pending}
            disabled={!proposal || count === 0}
            onClick={() =>
              run(() => applyProposalAction(teamId, weekStart, proposal!.entries), {
                onSuccess: (data) => {
                  onApplied(data);
                  onClose();
                },
              })
            }
          >
            החלת ההצעה{count ? ` (${count})` : ""}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <FormError error={error ?? loadError} />

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm">
          <span className="text-fg-muted">
            לפי ימי העבודה והמשמרת הקבועים, המינימום של הצוות, מכסת הבית, וחלוקה הוגנת של ערבים
            ושישי ({proposal?.historyWeeks ?? 8} שבועות אחורה).
          </span>
          <span title={hasMinimum ? undefined : "צריך להגדיר מינימום לצוות"}>
            <Checkbox
              label="סבב שישי: רק כמה שצריך"
              checked={fridayRotation}
              disabled={!hasMinimum || loading}
              onChange={(e) => {
                setProposal(null);
                setFridayRotation(e.target.checked);
              }}
            />
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-fg-muted">
            <Spinner />
            מכין הצעה…
          </div>
        ) : proposal ? (
          <>
            {proposal.warnings.length > 0 ? (
              <ul className="space-y-1 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
                {proposal.warnings.map((w) => (
                  <li key={w} className="flex items-start gap-2 text-warning-fg">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    {w}
                  </li>
                ))}
              </ul>
            ) : null}

            <section>
              <h3 className="mb-2 text-sm font-semibold">כיסוי לפי יום</h3>
              <div
                className="grid gap-1.5"
                style={{
                  gridTemplateColumns: `repeat(${proposal.coverage.length}, minmax(0, 1fr))`,
                }}
              >
                {proposal.coverage.map((c) => {
                  const short =
                    c.workable &&
                    (c.after.morning < c.needMorning || c.after.evening < c.needEvening);
                  return (
                    <div
                      key={c.date}
                      className={cn(
                        "rounded-lg border px-1 py-1.5 text-center text-[11px] leading-tight",
                        !c.workable && "border-dashed border-border text-fg-subtle",
                        c.workable && !short && "border-border bg-muted/40",
                        short && "border-danger/30 bg-danger/10 text-danger",
                      )}
                    >
                      <div className="font-semibold">{WEEKDAY_SHORT[weekdayOf(c.date)]}</div>
                      <div className="text-fg-subtle">{formatDayMonth(c.date)}</div>
                      {c.workable ? (
                        <div className="mt-1 tabular-nums">
                          <div>
                            ב׳ {c.before.morning}→<strong>{c.after.morning}</strong>
                            {c.needMorning ? `/${c.needMorning}` : ""}
                          </div>
                          {c.eveningExpected ? (
                            <div>
                              ע׳ {c.before.evening}→<strong>{c.after.evening}</strong>
                              {c.needEvening ? `/${c.needEvening}` : ""}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="mt-1">—</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-sm font-semibold">
                שיבוצים מוצעים {count ? `(${count})` : ""}
              </h3>
              {count === 0 ? (
                <p className="flex items-center gap-2 text-sm text-fg-muted">
                  <Info className="h-4 w-4" />
                  אין מה להוסיף: המשבצות כבר מלאות, או שאין לנציגים ימי עבודה קבועים.
                </p>
              ) : (
                <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                  {byAgent.map(([agentId, list]) => (
                    <li key={agentId} className="flex flex-wrap items-center gap-2 px-3 py-2">
                      <span className="min-w-28 text-sm font-medium">{agentNames[agentId]}</span>
                      <span className="flex flex-wrap gap-1">
                        {list.map((e) => {
                          const shift = shiftOf(e.shiftId);
                          const location = locationOf(e.locationId);
                          const special = e.reasons.some((r) => r !== "default");
                          return (
                            <span
                              key={e.date}
                              title={e.reasons.map((r) => REASON_LABELS[r]).join(" · ")}
                              className={cn(
                                "rounded-md border px-1.5 py-0.5 text-[11px]",
                                special && "ring-1 ring-primary/60",
                              )}
                              style={
                                shift
                                  ? {
                                      backgroundColor: tint(shift.color, "18"),
                                      borderColor: tint(shift.color, "55"),
                                    }
                                  : undefined
                              }
                            >
                              <strong>{WEEKDAY_SHORT[weekdayOf(e.date)]}</strong>{" "}
                              <span style={{ color: shift?.color }}>{shift?.name}</span>
                              {location?.requiresQuota ? ` · ${location.name}` : ""}
                            </span>
                          );
                        })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-1 text-xs text-fg-muted">
                משבצת במסגרת כחולה שונתה מברירת המחדל (מעבר משמרת, או מוקד במקום בית). העבירו עליה
                את העכבר כדי לראות למה.
              </p>
            </section>

            <section>
              <h3 className="mb-2 text-sm font-semibold">הוגנות</h3>
              <div className="max-h-56 overflow-y-auto rounded-lg border border-border">
                <Table>
                  <thead>
                    <tr>
                      <Th>נציג</Th>
                      <Th className="text-center">ימי עבודה השבוע</Th>
                      <Th className="text-center">ערבים השבוע</Th>
                      <Th className="text-center">ערבים ב־{proposal.historyWeeks} שבועות</Th>
                      <Th className="text-center">שישי השבוע</Th>
                      <Th className="text-center">שישי ב־{proposal.historyWeeks} שבועות</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {proposal.fairness.map((f) => (
                      <tr key={f.agentId}>
                        <Td className="font-medium">{f.name}</Td>
                        <Td className="text-center">{f.weekDays}</Td>
                        <Td className="text-center">{f.weekEvenings}</Td>
                        <Td className="text-center text-fg-muted">{f.pastEvenings}</Td>
                        <Td className="text-center">{f.weekFridays}</Td>
                        <Td className="text-center text-fg-muted">{f.pastFridays}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </Dialog>
  );
}
