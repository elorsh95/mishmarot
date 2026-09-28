import { cn } from "@/lib/cn";
import type { WorkLocation } from "@/modules/catalog/service";
import { homeCount, seatStatus, type Half, type SeatUsage } from "@/modules/schedule/seats";

type Location = Pick<WorkLocation, "id" | "name" | "requiresQuota" | "capacity" | "isActive">;

/** "מוקד 3 · בית 2": where the agents of one half day work. */
export function LocationSplit({
  usage,
  date,
  half,
  locations,
}: {
  usage: SeatUsage;
  date: string;
  half: Half;
  locations: Location[];
}) {
  const counts = usage[date]?.[half] ?? {};
  const parts = locations.filter((l) => counts[l.id]).map((l) => `${l.name} ${counts[l.id]}`);
  if (parts.length === 0) return null;
  return <div className="text-[11px] text-fg-subtle">{parts.join(" · ")}</div>;
}

export function hasSeatLimits(locations: Location[]) {
  return locations.some((l) => l.isActive && l.capacity);
}

/**
 * Seats taken at the locations that have a seat count (the office) on one half day, against the
 * count: red when it overflows, amber when seats are free while agents work from home.
 */
export function SeatsLine({
  usage,
  date,
  half,
  label,
  locations,
}: {
  usage: SeatUsage;
  date: string;
  half: Half;
  label: string;
  locations: Location[];
}) {
  const home = homeCount(usage, date, half, locations);
  const statuses = seatStatus(usage, date, half, locations);
  return (
    <>
      {statuses.map((s) => {
        const name = locations.find((l) => l.id === s.locationId)?.name ?? "";
        const underused = s.free > 0 && home > 0;
        return (
          <div
            key={s.locationId}
            className={cn(
              "tabular-nums",
              s.over > 0 && "font-semibold text-danger",
              !s.over && underused && "font-medium text-warning-fg",
            )}
            title={
              s.over > 0
                ? `${s.over} נציגים מעבר למספר העמדות ב${name}`
                : underused
                  ? `${s.free} עמדות פנויות ב${name}, ו-${home} נציגים עובדים מהבית`
                  : `${s.free} עמדות פנויות ב${name}`
            }
          >
            {label} {name}: <strong>{s.used}</strong>/{s.capacity}
            {s.over > 0 ? ` · חריגה ${s.over}` : underused ? ` · ${s.free} פנויות` : ""}
          </div>
        );
      })}
    </>
  );
}
