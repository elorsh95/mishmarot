"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, Input } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import type { Catalog } from "@/modules/catalog/service";
import type { SkippedOp } from "@/modules/schedule/engine";
import { setEntriesAction } from "./actions";
import { ChoiceGroup } from "./cell-editor";
import { useAction } from "@/components/ui/use-action";

export interface BulkCell {
  agentId: string;
  date: string;
}

/**
 * Sets one entry on all selected cells, or clears them. Days where the entry isn't allowed
 * (a holiday, a shift that doesn't run that day, a locked week) are skipped and reported.
 */
export function BulkEditor({
  cells,
  catalog,
  agentCount,
  dayCount,
  onClose,
  onDone,
}: {
  cells: BulkCell[];
  catalog: Catalog;
  agentCount: number;
  dayCount: number;
  onClose: () => void;
  onDone: (result: { summary: string; skipped: SkippedOp[]; undoToken?: string | null }) => void;
}) {
  const shifts = catalog.shifts.filter((s) => s.isActive);
  const locations = catalog.locations.filter((l) => l.isActive);
  const absences = catalog.absenceTypes.filter((a) => a.isActive);
  const [kind, setKind] = useState<"shift" | "absence" | "clear">("shift");
  const [shiftId, setShiftId] = useState(shifts[0]?.id ?? "");
  const [locationId, setLocationId] = useState(
    locations.find((l) => !l.requiresQuota)?.id ?? locations[0]?.id ?? "",
  );
  const [absenceTypeId, setAbsenceTypeId] = useState(absences[0]?.id ?? "");
  const [note, setNote] = useState("");
  const { run, pending, error } = useAction();

  function save() {
    const entry =
      kind === "clear"
        ? null
        : kind === "shift"
          ? { kind, shiftId, locationId, note }
          : { kind, absenceTypeId, note };
    run(() => setEntriesAction(cells, entry), {
      onSuccess: (data) => {
        onClose();
        onDone(data);
      },
    });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="שיבוץ מרוכז"
      description={`${cells.length} משבצות · ${agentCount} נציגים · ${dayCount} ימים`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            ביטול
          </Button>
          <Button
            variant={kind === "clear" ? "danger" : "primary"}
            onClick={save}
            loading={pending}
          >
            {kind === "clear" ? "הסרת השיבוצים" : "שמירה לכל הנבחרים"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormError error={error} />
        <div className="inline-flex rounded-lg border border-border bg-muted p-0.5">
          {(
            [
              ["shift", "משמרת"],
              ["absence", "היעדרות"],
              ["clear", "הסרה"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={cn(
                "rounded-md px-4 py-1.5 text-sm font-medium",
                kind === k ? "bg-surface shadow-sm" : "text-fg-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {kind === "shift" ? (
          <>
            <Field label="משמרת">
              <ChoiceGroup
                value={shiftId}
                onChange={setShiftId}
                options={shifts.map((s) => ({ id: s.id, label: s.name, color: s.color }))}
              />
            </Field>
            <Field label="מיקום עבודה">
              <ChoiceGroup
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
            {locations.find((l) => l.id === locationId)?.requiresQuota ? (
              <p className="rounded-lg bg-muted px-3 py-2 text-sm text-fg-muted">
                ימים מעבר למכסה של כל נציג יישלחו לאישור מנהלת המוקד.
              </p>
            ) : null}
          </>
        ) : kind === "absence" ? (
          <Field label="סוג היעדרות">
            <ChoiceGroup
              value={absenceTypeId}
              onChange={setAbsenceTypeId}
              options={absences.map((a) => ({ id: a.id, label: a.name, color: a.color }))}
            />
          </Field>
        ) : (
          <p className="text-sm">כל השיבוצים וההיעדרויות במשבצות שנבחרו יוסרו.</p>
        )}

        {kind !== "clear" ? (
          <Field label="הערה" htmlFor="bulk-note">
            <Input
              id="bulk-note"
              value={note}
              maxLength={300}
              onChange={(e) => setNote(e.target.value)}
              placeholder="אופציונלי"
            />
          </Field>
        ) : null}
        <p className="text-xs text-fg-muted">
          ימים שבהם השיבוץ לא אפשרי (חג, משמרת שלא מתקיימת ביום זה, שבוע נעול) ידולגו, ותוצג רשימה
          שלהם.
        </p>
      </div>
    </Dialog>
  );
}
