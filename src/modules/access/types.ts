/** Access log: who viewed or exported personal data, and access that was refused. Client-safe. */

export type AccessAction = "view" | "export" | "denied";

export const ACCESS_ACTION_LABELS: Record<AccessAction, string> = {
  view: "צפייה",
  export: "ייצוא",
  denied: "גישה נדחתה",
};

export interface AccessEntry {
  id: string;
  actorId: string | null;
  actorName: string;
  action: AccessAction;
  /** What was accessed, e.g. "schedule", "agents", "attendance". */
  resource: string;
  /** Hebrew description, e.g. "סידור עבודה · רנו · שבוע 27.9". */
  detail: string;
  teamId: string | null;
  createdAt: string;
}
