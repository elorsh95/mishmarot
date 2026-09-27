import type { IsoDate, IsoMonth } from "@/lib/dates";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface ApprovalRequest {
  id: string;
  type: "monthly_quota";
  assignmentId: string;
  agentId: string;
  teamId: string;
  date: IsoDate;
  month: IsoMonth;
  shiftId: string | null;
  locationId: string | null;
  /** Which counted quota day of the period (week or month) this is, e.g. 3 = the third home day. */
  position: number;
  quota: number;
  status: ApprovalStatus;
  requestedBy: string;
  requestedByName: string;
  decidedBy: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNote: string;
  cancelReason: "deleted" | "changed" | "released" | null;
  createdAt: string;
}

export interface ApprovalListItem extends ApprovalRequest {
  agentName: string;
  employeeNumber: string;
  /** The agent's counted quota days in the same quota period (week or month). */
  quotaDates: IsoDate[];
  /** e.g. "בשבוע של 13.9" or "בספטמבר 2026". */
  periodLabel: string;
  /** The day has arrived and the request is still pending. */
  urgent: boolean;
}

export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  pending: "ממתין לאישור",
  approved: "אושר",
  rejected: "נדחה",
  cancelled: "בוטל",
};
