import type { IsoDate, IsoMonth } from "@/lib/dates";

export type EntryKind = "shift" | "absence";

/**
 * Quota state of a day at a quota location (e.g. home):
 * - none: not at a quota location (or an absence)
 * - within_quota: inside the agent's monthly quota, no approval needed
 * - pending: over quota, waiting for approval
 * - approved / rejected: decided by the center manager
 */
export type QuotaStatus = "none" | "within_quota" | "pending" | "approved" | "rejected";

export interface Assignment {
  /** `${agentId}_${date}`: one entry per agent per day. */
  id: string;
  agentId: string;
  teamId: string;
  date: IsoDate;
  month: IsoMonth;
  weekStart: IsoDate;
  kind: EntryKind;
  shiftId: string | null;
  locationId: string | null;
  absenceTypeId: string | null;
  note: string;
  quotaStatus: QuotaStatus;
  approvalId: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export type EntryInput =
  | { kind: "shift"; shiftId: string; locationId: string; note?: string }
  | { kind: "absence"; absenceTypeId: string; note?: string };

export interface ChangeOp {
  agentId: string;
  date: IsoDate;
  /** null clears the day. */
  entry: EntryInput | null;
}

export type WeekStatus = "draft" | "published";

export interface WeekSchedule {
  id: string;
  teamId: string;
  weekStart: IsoDate;
  status: WeekStatus;
  publishedBy: string | null;
  publishedByName: string | null;
  publishedAt: string | null;
}

export function assignmentId(agentId: string, date: IsoDate) {
  return `${agentId}_${date}`;
}

export function weekId(teamId: string, weekStart: IsoDate) {
  return `${teamId}_${weekStart}`;
}

export const QUOTA_STATUS_LABELS: Record<QuotaStatus, string> = {
  none: "",
  within_quota: "במסגרת המכסה",
  pending: "ממתין לאישור",
  approved: "אושר",
  rejected: "נדחה",
};
