import type { IsoMonth } from "@/lib/dates";

/** One agent's month: work days by shift, home days by quota state, absences by type. */
export interface AgentMonthRow {
  agentId: string;
  agentName: string;
  employeeNumber: string;
  teamName: string;
  isActive: boolean;
  /** Days with a shift (any location, any quota state). */
  workDays: number;
  byShift: Record<string, number>;
  /** Days at a quota location (home): within quota, approved over quota, pending and rejected. */
  home: { withinQuota: number; approved: number; pending: number; rejected: number };
  quota: number;
  byAbsence: Record<string, number>;
  absenceDays: number;
}

export interface MonthlyReport {
  month: IsoMonth;
  teamName: string | null;
  shifts: Array<{ id: string; name: string }>;
  absences: Array<{ id: string; name: string }>;
  rows: AgentMonthRow[];
}

/** Home days that count toward the quota (within it or approved beyond it). */
export function homeDays(row: AgentMonthRow): number {
  return row.home.withinQuota + row.home.approved;
}
