export type TransferStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface TransferRequest {
  id: string;
  agentId: string;
  agentName: string;
  employeeNumber: string;
  fromTeamId: string;
  toTeamId: string;
  status: TransferStatus;
  note: string;
  requestedBy: string;
  requestedByName: string;
  decidedBy: string | null;
  decidedByName: string | null;
  decisionNote: string;
  decidedAt: string | null;
  createdAt: string;
}

export const TRANSFER_STATUS_LABELS: Record<TransferStatus, string> = {
  pending: "ממתינה",
  approved: "אושרה",
  rejected: "נדחתה",
  cancelled: "בוטלה",
};

export interface AgentBrief {
  id: string;
  name: string;
  employeeNumber: string;
  teamId: string;
  teamName: string;
}
