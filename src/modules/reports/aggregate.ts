import type { Assignment } from "@/modules/schedule/types";
import type { AgentMonthRow } from "./types";

type AgentInfo = Pick<
  AgentMonthRow,
  "agentId" | "agentName" | "employeeNumber" | "teamName" | "isActive" | "quota"
>;

/** Sums a month of entries per agent. Pure, so it is unit-tested directly. */
export function aggregateMonth(
  agents: AgentInfo[],
  entries: Pick<
    Assignment,
    "agentId" | "kind" | "shiftId" | "locationId" | "absenceTypeId" | "quotaStatus"
  >[],
  quotaLocationIds: Set<string>,
): AgentMonthRow[] {
  const rows = new Map<string, AgentMonthRow>(
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
