import { CheckCircle2, Clock, Home, MessageSquare, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Catalog } from "@/modules/catalog/service";
import type { Assignment } from "@/modules/schedule/types";

export function tint(color: string, alpha: string) {
  return `${color}${alpha}`;
}

/** Visual summary of one day's entry. */
export function EntryChip({
  entry,
  catalog,
  compact = false,
}: {
  entry: Assignment;
  catalog: Catalog;
  compact?: boolean;
}) {
  if (entry.kind === "absence") {
    const absence = catalog.absenceTypes.find((a) => a.id === entry.absenceTypeId);
    const color = absence?.color ?? "#6b7280";
    return (
      <div
        className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed px-2 py-1.5 text-xs font-semibold"
        style={{ backgroundColor: tint(color, "14"), borderColor: tint(color, "66"), color }}
      >
        {absence?.name ?? "היעדרות"}
        {entry.note ? <MessageSquare className="h-3 w-3 opacity-70" /> : null}
      </div>
    );
  }

  const shift = catalog.shifts.find((s) => s.id === entry.shiftId);
  const location = catalog.locations.find((l) => l.id === entry.locationId);
  const color = shift?.color ?? "#64748b";
  const status = entry.quotaStatus;

  return (
    <div
      className={cn(
        "relative flex w-full flex-col items-center rounded-lg border px-2 py-1 text-center",
        status === "pending" && "ring-2 ring-warning",
        status === "rejected" && "ring-2 ring-danger",
      )}
      style={{ backgroundColor: tint(color, "18"), borderColor: tint(color, "55") }}
    >
      <span className="text-xs font-bold" style={{ color }}>
        {shift?.name ?? "משמרת"}
      </span>
      {!compact || location?.requiresQuota ? (
        <span
          className={cn(
            "flex items-center gap-0.5 text-[11px]",
            location?.requiresQuota ? "font-semibold text-fg" : "text-fg-muted",
          )}
        >
          {location?.requiresQuota ? <Home className="h-3 w-3" /> : null}
          {location?.name ?? ""}
        </span>
      ) : null}
      <StatusIcon status={status} />
      {entry.note ? (
        <MessageSquare className="absolute start-1 top-1 h-3 w-3 text-fg-subtle" />
      ) : null}
    </div>
  );
}

export function StatusIcon({ status }: { status: Assignment["quotaStatus"] }) {
  const base = "absolute -top-1.5 -end-1.5 h-4 w-4 rounded-full bg-surface";
  if (status === "pending")
    return <Clock className={cn(base, "text-warning")} aria-label="ממתין לאישור" />;
  if (status === "approved")
    return <CheckCircle2 className={cn(base, "text-success")} aria-label="אושר" />;
  if (status === "rejected")
    return <XCircle className={cn(base, "text-danger")} aria-label="נדחה" />;
  return null;
}
