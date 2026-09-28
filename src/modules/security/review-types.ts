import type { PermissionScope } from "@/modules/permissions/catalog";

/** One user in the periodic permissions review. Client-safe. */
export interface ReviewRow {
  userId: string;
  fullName: string;
  username: string;
  roleName: string;
  isActive: boolean;
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  /** Days since the last login (or since the user was created, if never). */
  idleDays: number;
  teams: string[];
  permissions: Array<{ label: string; scope: PermissionScope }>;
  /** What needs attention, in Hebrew. */
  flags: string[];
}

export interface PermissionReview {
  rows: ReviewRow[];
  lastReview: { at: string; byName: string } | null;
}

/** Users who haven't logged in this long are flagged for deactivation. */
export const IDLE_FLAG_DAYS = 90;
