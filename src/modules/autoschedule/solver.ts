import { formatDayMonth, WEEKDAY_NAMES, weekdayOf, type IsoDate } from "@/lib/dates";
import { shiftRunsOn, shiftWeekday, type DayInfo } from "@/modules/calendar/types";
import type {
  AutoScheduleOptions,
  DayCoverage,
  FairnessRow,
  ProposalReason,
  ProposedEntry,
} from "./types";

/**
 * The auto-schedule ("הצע סידור") as a pure function, so it is unit-tested directly.
 *
 * It fills only empty cells, day by day:
 * 1. Agents work their usual weekdays, in their default shift and location.
 * 2. If the evening is below the team's minimum, the agents with the fewest evenings (in the
 *    look-back weeks and so far this week) move from a morning shift to an evening one, as long
 *    as the morning stays at its minimum; the same the other way round for the morning.
 * 3. A home (quota) day is used only while the agent has quota left in that period; otherwise
 *    the agent is placed at a non-quota location (the office), so no approvals are opened.
 * 4. Optionally, on Fridays and holiday eves only as many agents as the minimum needs are
 *    scheduled, the ones with the fewest Fridays first.
 * Closed days, and shifts that don't run on a day, are respected. Nothing it can't meet is
 * forced: it is reported as a warning instead.
 */

export interface SolverShift {
  id: string;
  name: string;
  daysOfWeek: number[];
  coversMorning: boolean;
  coversEvening: boolean;
  isActive: boolean;
  sortOrder: number;
}

export interface SolverLocation {
  id: string;
  requiresQuota: boolean;
  isActive: boolean;
  sortOrder: number;
}

export interface SolverAgent {
  id: string;
  name: string;
  defaultShiftId: string | null;
  defaultLocationId: string | null;
  /** 0 = Sunday … 6 = Saturday */
  defaultDays: number[];
}

export interface SolverInput {
  days: IsoDate[];
  dayInfo: Record<IsoDate, DayInfo>;
  shifts: SolverShift[];
  locations: SolverLocation[];
  /** Active agents of the team. */
  agents: SolverAgent[];
  /** This week's existing entries: kept as they are, and counted. */
  existing: Array<{
    agentId: string;
    date: IsoDate;
    kind: "shift" | "absence";
    shiftId: string | null;
    quotaStatus: string;
  }>;
  /** The team's minimum agents on the morning / evening. */
  min: { morning: number; evening: number };
  /** Home days each agent may still take without approval, per quota period key. */
  quotaLeft: Record<string, Record<string, number>>;
  periodKeyOf: (date: IsoDate) => string;
  /** Evenings and Fridays each agent worked in the look-back weeks. */
  history: Record<string, { evenings: number; fridays: number }>;
  options: AutoScheduleOptions;
}

export interface SolverResult {
  entries: ProposedEntry[];
  coverage: DayCoverage[];
  fairness: FairnessRow[];
  warnings: string[];
}

const dayLabel = (date: IsoDate) => `${WEEKDAY_NAMES[weekdayOf(date)]} ${formatDayMonth(date)}`;

export function solveWeek(input: SolverInput): SolverResult {
  const shiftById = new Map(input.shifts.map((s) => [s.id, s]));
  const byOrder = <T extends { sortOrder: number }>(list: T[]) =>
    [...list].sort((a, b) => a.sortOrder - b.sortOrder);
  const activeShifts = byOrder(input.shifts.filter((s) => s.isActive));
  const activeLocations = byOrder(input.locations.filter((l) => l.isActive));
  const office = activeLocations.find((l) => !l.requiresQuota) ?? null;
  const locationById = new Map(input.locations.map((l) => [l.id, l]));
  const quotaLeft = structuredClone(input.quotaLeft);

  // Running counts this week (existing entries first, then what the solver adds).
  const week = new Map<string, { evenings: number; fridays: number; days: number }>(
    input.agents.map((a) => [a.id, { evenings: 0, fridays: 0, days: 0 }]),
  );
  const count = (agentId: string, date: IsoDate, shift: SolverShift | undefined) => {
    const w = week.get(agentId);
    if (!w || !shift) return;
    w.days += 1;
    if (shift.coversEvening) w.evenings += 1;
    if (shiftWeekday(date, input.dayInfo[date]) === 5) w.fridays += 1;
  };
  const eveningBurden = (id: string) =>
    (input.history[id]?.evenings ?? 0) + (week.get(id)?.evenings ?? 0);
  const fridayBurden = (id: string) =>
    (input.history[id]?.fridays ?? 0) + (week.get(id)?.fridays ?? 0);
  const nameOf = new Map(input.agents.map((a) => [a.id, a.name]));
  const byName = (a: string, b: string) =>
    (nameOf.get(a) ?? "").localeCompare(nameOf.get(b) ?? "", "he");

  for (const e of input.existing) {
    if (e.kind === "shift" && e.quotaStatus !== "rejected") {
      count(e.agentId, e.date, e.shiftId ? shiftById.get(e.shiftId) : undefined);
    }
  }

  const entries: ProposedEntry[] = [];
  const coverage: DayCoverage[] = [];
  const warnings: string[] = [];

  const noDays = input.agents.filter((a) => a.defaultDays.length === 0);
  if (noDays.length > 0) {
    warnings.push(`לא שובצו כי אין להם ימי עבודה קבועים: ${noDays.map((a) => a.name).join(", ")}`);
  }

  for (const date of input.days) {
    const info = input.dayInfo[date];
    const running = activeShifts.filter((s) => shiftRunsOn(s, date, info));
    const eveningExpected = running.some((s) => s.coversEvening);
    const needMorning = input.min.morning;
    const needEvening = eveningExpected ? input.min.evening : 0;

    const today = input.existing.filter((e) => e.date === date);
    const filled = new Set(today.map((e) => e.agentId));
    let morning = 0;
    let evening = 0;
    for (const e of today) {
      if (e.kind !== "shift" || e.quotaStatus === "rejected") continue;
      const s = e.shiftId ? shiftById.get(e.shiftId) : undefined;
      if (s?.coversMorning) morning += 1;
      if (s?.coversEvening) evening += 1;
    }
    const before = { morning, evening };

    if (running.length === 0) {
      coverage.push({
        date,
        workable: false,
        eveningExpected,
        needMorning,
        needEvening,
        before,
        after: before,
      });
      continue;
    }

    let candidates = input.agents
      .filter((a) => !filled.has(a.id) && a.defaultDays.includes(weekdayOf(date)))
      .map((a) => a.id);

    // Friday rotation: only as many as the morning minimum still needs, fewest Fridays first.
    const isFriday = shiftWeekday(date, info) === 5;
    if (isFriday && input.options.fridayRotation && needMorning > 0) {
      const needed = Math.max(0, needMorning - morning);
      candidates = [...candidates]
        .sort((a, b) => fridayBurden(a) - fridayBurden(b) || byName(a, b))
        .slice(0, needed);
    }

    // 1. Default shift, or one that helps where it's needed.
    const morningOnly = running.find((s) => s.coversMorning && !s.coversEvening);
    const eveningShift =
      running.find((s) => s.coversEvening && !s.coversMorning) ??
      running.find((s) => s.coversEvening);
    const plan = new Map<string, { shift: SolverShift; reasons: ProposalReason[] }>();
    const add = (s: SolverShift, sign: 1 | -1) => {
      if (s.coversMorning) morning += sign;
      if (s.coversEvening) evening += sign;
    };
    const flexible: string[] = [];
    for (const id of candidates) {
      const agent = input.agents.find((a) => a.id === id)!;
      const own = agent.defaultShiftId ? running.find((s) => s.id === agent.defaultShiftId) : null;
      if (own) {
        plan.set(id, { shift: own, reasons: ["default"] });
        add(own, 1);
      } else {
        flexible.push(id);
      }
    }
    // Agents without a default shift (or whose shift doesn't run today) go where it's needed.
    for (const id of flexible) {
      const shift =
        (evening < needEvening ? eveningShift : undefined) ??
        (morning < needMorning ? morningOnly : undefined) ??
        morningOnly ??
        eveningShift ??
        running[0];
      plan.set(id, { shift, reasons: ["no_default_shift"] });
      add(shift, 1);
    }

    // 2. Balance the evening and the morning against the minimums, fairly.
    const assignedTo = (match: (s: SolverShift) => boolean) =>
      [...plan.entries()].filter(([, p]) => match(p.shift)).map(([id]) => id);
    const isMorningOnly = (s: SolverShift) => s.coversMorning && !s.coversEvening;
    const isEveningOnly = (s: SolverShift) => s.coversEvening && !s.coversMorning;
    while (evening < needEvening && eveningShift && morning - 1 >= needMorning) {
      const pool = assignedTo(isMorningOnly);
      if (pool.length === 0) break;
      // The one who has had the fewest evenings takes this one.
      pool.sort((a, b) => eveningBurden(a) - eveningBurden(b) || byName(a, b));
      const p = plan.get(pool[0])!;
      add(p.shift, -1);
      p.shift = eveningShift;
      p.reasons = ["moved_to_evening"];
      add(eveningShift, 1);
    }
    while (morning < needMorning && morningOnly && evening - 1 >= needEvening) {
      const pool = assignedTo(isEveningOnly);
      if (pool.length === 0) break;
      // The one who has had the most evenings gets the morning.
      pool.sort((a, b) => eveningBurden(b) - eveningBurden(a) || byName(a, b));
      const p = plan.get(pool[0])!;
      add(p.shift, -1);
      p.shift = morningOnly;
      p.reasons = ["moved_to_morning"];
      add(morningOnly, 1);
    }

    // 3. Location, within the home quota.
    for (const [id, p] of plan) {
      const agent = input.agents.find((a) => a.id === id)!;
      const preferred = agent.defaultLocationId
        ? locationById.get(agent.defaultLocationId)
        : undefined;
      let location = preferred?.isActive ? preferred : (office ?? activeLocations[0]);
      if (!location) continue;
      if (location.requiresQuota) {
        const key = input.periodKeyOf(date);
        const left = quotaLeft[id]?.[key] ?? 0;
        if (left > 0) {
          quotaLeft[id] = { ...quotaLeft[id], [key]: left - 1 };
        } else if (office) {
          location = office;
          p.reasons.push("office_instead_of_home");
        }
      }
      entries.push({
        agentId: id,
        date,
        shiftId: p.shift.id,
        locationId: location.id,
        reasons: p.reasons,
      });
      count(id, date, p.shift);
    }

    if (morning < needMorning) {
      warnings.push(`${dayLabel(date)}: חסרים נציגים בבוקר (${morning} מתוך ${needMorning})`);
    }
    if (evening < needEvening) {
      warnings.push(`${dayLabel(date)}: חסרים נציגים בערב (${evening} מתוך ${needEvening})`);
    }
    coverage.push({
      date,
      workable: true,
      eveningExpected,
      needMorning,
      needEvening,
      before,
      after: { morning, evening },
    });
  }

  const fairness: FairnessRow[] = input.agents
    .map((a) => ({
      agentId: a.id,
      name: a.name,
      pastEvenings: input.history[a.id]?.evenings ?? 0,
      pastFridays: input.history[a.id]?.fridays ?? 0,
      weekEvenings: week.get(a.id)?.evenings ?? 0,
      weekFridays: week.get(a.id)?.fridays ?? 0,
      weekDays: week.get(a.id)?.days ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "he"));

  return { entries, coverage, fairness, warnings };
}
