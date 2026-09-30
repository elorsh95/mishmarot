import type { CSSProperties } from "react";
import Link from "next/link";
import { Armchair, ChevronLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { formatDayMonth, WEEKDAY_SHORT, weekdayOf } from "@/lib/dates";
import type { WorkLocation } from "@/modules/catalog/service";
import { poolWeek, type PoolStatus, type SeatUsage } from "@/modules/schedule/seats";

export interface SeatsPoolCard {
  id: string;
  label: string;
  capacity: number;
  usage: SeatUsage;
  /** The schedule of the pool's teams this week. */
  href: string;
}

type Day = { date: string; workable: boolean; eveningExpected: boolean };
type Location = Pick<WorkLocation, "id" | "capacity" | "isActive" | "requiresQuota">;

/** "תפוסת עמדות השבוע": each activity's office seats (and the whole center's) per day. */
export function SeatsSection({
  pools,
  days,
  today,
  locations,
}: {
  pools: SeatsPoolCard[];
  days: Day[];
  today: string;
  locations: Location[];
}) {
  if (pools.length === 0) return null;
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="font-semibold">תפוסת עמדות השבוע</h2>
        <span className="text-xs text-fg-muted">עמדות תפוסות במוקד · בוקר ובערב</span>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {pools.map((pool) => (
          <PoolCard key={pool.id} pool={pool} days={days} today={today} locations={locations} />
        ))}
      </div>
    </section>
  );
}

function PoolCard({
  pool,
  days,
  today,
  locations,
}: {
  pool: SeatsPoolCard;
  days: Day[];
  today: string;
  locations: Location[];
}) {
  const week = poolWeek(pool.usage, days, pool.capacity, locations);
  const todayCell = week.days.find((d) => d.date === today);
  const status =
    week.overDays > 0
      ? { tone: "danger" as const, text: `חריגה ב-${daysLabel(week.overDays)}` }
      : week.underusedDays > 0
        ? { tone: "warning" as const, text: `עמדות פנויות ב-${daysLabel(week.underusedDays)}` }
        : { tone: "success" as const, text: "בתוך מספר העמדות" };

  return (
    <Card className="overflow-hidden transition hover:border-primary/40 hover:shadow">
      <Link href={pool.href} className="block p-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Armchair className="h-5 w-5" />
            </span>
            <div>
              <p className="font-semibold">{pool.label}</p>
              <p className="text-xs text-fg-muted">{pool.capacity} עמדות</p>
            </div>
          </div>
          <div className="flex items-center gap-1 text-fg-muted">
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-medium",
                status.tone === "danger" && "bg-danger/10 text-danger",
                status.tone === "warning" && "bg-warning/15 text-warning-fg",
                status.tone === "success" && "bg-success/10 text-success",
              )}
            >
              {status.text}
            </span>
            <ChevronLeft className="h-4 w-4" />
          </div>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2 text-center">
          <Stat
            label="היום בבוקר"
            value={todayCell?.morning ? `${todayCell.morning.used}/${pool.capacity}` : "—"}
          />
          <Stat label="שיא השבוע" value={`${week.peak}/${pool.capacity}`} />
          <Stat label="תפוסה ממוצעת" value={`${week.averagePct}%`} />
        </div>

        {/* Three days a row on a phone, the whole week in one row from sm up. */}
        <div
          className="grid grid-cols-3 gap-1.5 sm:[grid-template-columns:repeat(var(--days),minmax(0,1fr))]"
          style={{ "--days": week.days.length } as CSSProperties}
        >
          {week.days.map((d) => (
            <div
              key={d.date}
              className={cn(
                "rounded-lg border px-1.5 py-1.5 text-center",
                d.morning ? "border-border bg-muted/40" : "border-dashed border-border",
                d.date === today && "ring-2 ring-primary/50",
              )}
            >
              <div className="text-[11px] font-semibold">{WEEKDAY_SHORT[weekdayOf(d.date)]}</div>
              <div className="mb-1 text-[10px] text-fg-subtle">{formatDayMonth(d.date)}</div>
              {d.morning ? (
                <div className="space-y-1">
                  <HalfBar status={d.morning} label="ב׳" />
                  {d.evening ? <HalfBar status={d.evening} label="ע׳" /> : null}
                </div>
              ) : (
                <div className="text-[11px] text-fg-subtle">—</div>
              )}
            </div>
          ))}
        </div>
      </Link>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/50 px-2 py-1.5">
      <div className="text-base font-bold tabular-nums">{value}</div>
      <div className="text-[11px] text-fg-muted">{label}</div>
    </div>
  );
}

/** One half day: a fill bar (red over the count, amber with free seats and agents at home). */
function HalfBar({ status, label }: { status: PoolStatus; label: string }) {
  const pct = Math.min(100, Math.round((status.used / status.capacity) * 100));
  const over = status.over > 0;
  const underused = !over && status.free > 0 && status.home > 0;
  return (
    <div
      title={
        over
          ? `${status.used} בעמדות, ${status.over} מעבר למספר העמדות`
          : `${status.used} מתוך ${status.capacity} עמדות${underused ? `, ו-${status.home} בבית` : ""}`
      }
    >
      <div className="flex items-center justify-between gap-1 text-[10px] tabular-nums text-fg-muted">
        <span>{label}</span>
        <span className={cn(over && "font-semibold text-danger")}>
          {status.used}/{status.capacity}
        </span>
      </div>
      <div className="flex h-1.5 overflow-hidden rounded-full bg-border/70">
        <div
          className={cn(
            "h-full rounded-full",
            over ? "bg-danger" : underused ? "bg-warning" : "bg-primary",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

const daysLabel = (n: number) => (n === 1 ? "יום אחד" : `${n} ימים`);
