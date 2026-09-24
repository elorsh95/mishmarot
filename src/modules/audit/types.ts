export type AuditEntityType =
  | "assignment"
  | "approval"
  | "week"
  | "agent"
  | "team"
  | "user"
  | "role"
  | "shift"
  | "location"
  | "absenceType"
  | "settings"
  | "transfer"
  | "calendar"
  | "auth";

export interface AuditEntry {
  id: string;
  actorId: string | null;
  actorName: string;
  action: string;
  entityType: AuditEntityType;
  entityId: string;
  /** Team the change relates to, for scoped viewing by team managers. */
  teamId: string | null;
  /** Human-readable Hebrew summary. */
  summary: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
}

export const AUDIT_ENTITY_LABELS: Record<AuditEntityType, string> = {
  assignment: "שיבוץ",
  approval: "אישור חריג",
  week: "סידור שבועי",
  agent: "נציג",
  team: "צוות",
  user: "משתמש",
  role: "תפקיד",
  shift: "משמרת",
  location: "מיקום עבודה",
  absenceType: "סוג היעדרות",
  settings: "הגדרות",
  transfer: "העברת נציג",
  calendar: "לוח חגים",
  auth: "התחברות",
};
