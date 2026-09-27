import type { QuotaPeriod } from "@/modules/schedule/types";
import type { ReportRange } from "./period";

/** One agent over the report range: work days by shift, home days by quota state, absences by type. */
export interface AgentReportRow {
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
  /** The agent's quota per quota period (see Report.quotaPeriod). */
  quota: number;
  byAbsence: Record<string, number>;
  absenceDays: number;
}

/** One shift over the report range, across the selected teams. */
export interface ShiftReportRow {
  shiftId: string;
  name: string;
  /** Scheduled agent-days (any location, any quota state). */
  total: number;
  /** Distinct agents who worked it. */
  agents: number;
  /** Distinct dates it was staffed on. */
  days: number;
  byLocation: Record<string, number>;
  /** Index 0 = Sunday … 6 = Saturday. */
  byWeekday: number[];
  pending: number;
  rejected: number;
}

export interface AbsenceReportRow {
  absenceTypeId: string;
  name: string;
  days: number;
  agents: number;
}

export interface Report {
  range: ReportRange;
  teamName: string | null;
  /** Whether `quota` is per week or per month. */
  quotaPeriod: QuotaPeriod;
  shifts: Array<{ id: string; name: string }>;
  absences: Array<{ id: string; name: string }>;
  locations: Array<{ id: string; name: string }>;
  rows: AgentReportRow[];
  shiftRows: ShiftReportRow[];
  absenceRows: AbsenceReportRow[];
}

/** Home days that count toward the quota (within it or approved beyond it). */
export function homeDays(row: AgentReportRow): number {
  return row.home.withinQuota + row.home.approved;
}

/** Days that went beyond the quota: approved or still waiting for approval. */
export function overQuotaDays(row: AgentReportRow): number {
  return row.home.approved + row.home.pending;
}

/** Average staffed agents per staffed day. */
export function shiftAverage(row: ShiftReportRow): number {
  return row.days ? Math.round((row.total / row.days) * 10) / 10 : 0;
}
