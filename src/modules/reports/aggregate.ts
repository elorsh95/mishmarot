import { weekdayOf } from "@/lib/dates";
import type { Assignment } from "@/modules/schedule/types";
import type { AbsenceReportRow, AgentReportRow, ShiftReportRow } from "./types";

type AgentInfo = Pick<
  AgentReportRow,
  "agentId" | "agentName" | "employeeNumber" | "teamName" | "isActive" | "quota"
>;

type Entry = Pick<
  Assignment,
  "agentId" | "date" | "kind" | "shiftId" | "locationId" | "absenceTypeId" | "quotaStatus"
>;

/** Sums the range's entries per agent. Pure, so it is unit-tested directly. */
export function aggregateAgents(
  agents: AgentInfo[],
  entries: Omit<Entry, "date">[],
  quotaLocationIds: Set<string>,
): AgentReportRow[] {
  const rows = new Map<string, AgentReportRow>(
    agents.map((a) => [
      a.agentId,
      {
        ...a,
        workDays: 0,
        byShift: {},
        home: { withinQuota: 0, approved: 0, pending: 0, rejected: 0 },
        byAbsence: {},
        absenceDays: 0,
      },
    ]),
  );
  for (const e of entries) {
    const row = rows.get(e.agentId);
    if (!row) continue;
    if (e.kind === "absence") {
      row.absenceDays += 1;
      if (e.absenceTypeId)
        row.byAbsence[e.absenceTypeId] = (row.byAbsence[e.absenceTypeId] ?? 0) + 1;
      continue;
    }
    row.workDays += 1;
    if (e.shiftId) row.byShift[e.shiftId] = (row.byShift[e.shiftId] ?? 0) + 1;
    if (e.locationId && quotaLocationIds.has(e.locationId)) {
      if (e.quotaStatus === "approved") row.home.approved += 1;
      else if (e.quotaStatus === "pending") row.home.pending += 1;
      else if (e.quotaStatus === "rejected") row.home.rejected += 1;
      else row.home.withinQuota += 1;
    }
  }
  return [...rows.values()];
}

/**
 * Sums the range's entries per shift and per absence type, in catalog order.
 * Shifts and absence types with no entries are listed with zeros.
 */
export function aggregateShifts(
  shifts: Array<{ id: string; name: string }>,
  absences: Array<{ id: string; name: string }>,
  entries: Entry[],
): { shiftRows: ShiftReportRow[]; absenceRows: AbsenceReportRow[] } {
  const shiftRows = new Map<string, ShiftReportRow>(
    shifts.map((s) => [
      s.id,
      {
        shiftId: s.id,
        name: s.name,
        total: 0,
        agents: 0,
        days: 0,
        byLocation: {},
        byWeekday: [0, 0, 0, 0, 0, 0, 0],
        pending: 0,
        rejected: 0,
      },
    ]),
  );
  const absenceRows = new Map<string, AbsenceReportRow>(
    absences.map((a) => [a.id, { absenceTypeId: a.id, name: a.name, days: 0, agents: 0 }]),
  );
  const agentsOf = new Map<string, Set<string>>();
  const datesOf = new Map<string, Set<string>>();
  const add = (map: Map<string, Set<string>>, key: string, value: string) => {
    if (!map.has(key)) map.set(key, new Set());
    map.get(key)!.add(value);
  };

  for (const e of entries) {
    if (e.kind === "absence") {
      const row = e.absenceTypeId ? absenceRows.get(e.absenceTypeId) : undefined;
      if (!row) continue;
      row.days += 1;
      add(agentsOf, `a|${row.absenceTypeId}`, e.agentId);
      continue;
    }
    const row = e.shiftId ? shiftRows.get(e.shiftId) : undefined;
    if (!row) continue;
    row.total += 1;
    row.byWeekday[weekdayOf(e.date)] += 1;
    if (e.locationId) row.byLocation[e.locationId] = (row.byLocation[e.locationId] ?? 0) + 1;
    if (e.quotaStatus === "pending") row.pending += 1;
    else if (e.quotaStatus === "rejected") row.rejected += 1;
    add(agentsOf, `s|${row.shiftId}`, e.agentId);
    add(datesOf, row.shiftId, e.date);
  }
  for (const row of shiftRows.values()) {
    row.agents = agentsOf.get(`s|${row.shiftId}`)?.size ?? 0;
    row.days = datesOf.get(row.shiftId)?.size ?? 0;
  }
  for (const row of absenceRows.values())
    row.agents = agentsOf.get(`a|${row.absenceTypeId}`)?.size ?? 0;
  return { shiftRows: [...shiftRows.values()], absenceRows: [...absenceRows.values()] };
}
