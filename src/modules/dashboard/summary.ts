import { weekdayOf, type IsoDate } from "@/lib/dates";
import { shiftRunsOn, type DayInfo } from "@/modules/calendar/types";
import type { Assignment } from "@/modules/schedule/types";

export interface DaySummary {
  date: IsoDate;
  /** Some active shift runs that day (not a holiday, not an off day). */
  workable: boolean;
  /** Some active shift covering the evening runs that day (not on Fridays and eves). */
  eveningExpected: boolean;
  morning: number;
  evening: number;
  absent: number;
  /** Active agents of the team with nothing scheduled on a workable day. */
  unassigned: number;
  /** A workable day with nobody on the morning, or on an expected evening. */
  gap: boolean;
}

export interface WeekSummary {
  /** Active agents in the team. With none there is nothing to cover, so no gaps are reported. */
  agents: number;
  days: DaySummary[];
  unassigned: number;
  gaps: number;
}

type Shift = {
  id: string;
  isActive: boolean;
  daysOfWeek: number[];
  coversMorning: boolean;
  coversEvening: boolean;
};

/** Coverage of one team's week. Pure, so it is unit-tested directly. */
export function summarizeWeek({
  days,
  dayInfo,
  shifts,
  agentIds,
  entries,
}: {
  days: IsoDate[];
  dayInfo: Record<IsoDate, DayInfo>;
  shifts: Shift[];
  /** Active agents who belong to the team. */
  agentIds: string[];
  entries: Pick<Assignment, "agentId" | "date" | "kind" | "shiftId" | "quotaStatus">[];
}): WeekSummary {
  const active = shifts.filter((s) => s.isActive);
  const shiftOf = new Map(shifts.map((s) => [s.id, s]));
  const team = new Set(agentIds);
  const summaries = days.map((date): DaySummary => {
    const running = active.filter((s) => shiftRunsOn(s, date, dayInfo[date]));
    const workable = running.length > 0;
    const eveningExpected = running.some((s) => s.coversEvening);
    let morning = 0;
    let evening = 0;
    let absent = 0;
    const scheduled = new Set<string>();
    for (const e of entries) {
      if (e.date !== date) continue;
      scheduled.add(e.agentId);
      if (e.kind === "absence") absent += 1;
      else if (e.quotaStatus !== "rejected") {
        const shift = e.shiftId ? shiftOf.get(e.shiftId) : undefined;
        if (shift?.coversMorning) morning += 1;
        if (shift?.coversEvening) evening += 1;
      }
    }
    const unassigned = workable ? [...team].filter((id) => !scheduled.has(id)).length : 0;
    const gap = team.size > 0 && workable && (morning === 0 || (eveningExpected && evening === 0));
    return { date, workable, eveningExpected, morning, evening, absent, unassigned, gap };
  });
  return {
    agents: team.size,
    days: summaries,
    unassigned: summaries.reduce((n, d) => n + d.unassigned, 0),
    gaps: summaries.filter((d) => d.gap).length,
  };
}

/** Saturday is part of the week only if some active shift runs on it. */
export function weekDays(dates: IsoDate[], shifts: Shift[]): IsoDate[] {
  const hasSaturday = shifts.some((s) => s.isActive && s.daysOfWeek.includes(6));
  return dates.filter((d) => hasSaturday || weekdayOf(d) !== 6);
}
