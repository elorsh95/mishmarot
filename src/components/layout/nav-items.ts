import type { PermissionKey } from "@/modules/permissions/catalog";

export type NavIcon =
  | "home"
  | "calendar"
  | "approvals"
  | "agents"
  | "transfers"
  | "teams"
  | "users"
  | "roles"
  | "settings"
  | "audit";

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
  /** Shown if the user holds any of these permissions (empty = everyone). */
  anyOf: PermissionKey[];
  badge?: "approvals" | "transfers";
}

/** The navigation menu. New screens are added here. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "ראשי", icon: "home", anyOf: [] },
  { href: "/schedule", label: "סידור עבודה", icon: "calendar", anyOf: ["schedule.view"] },
  {
    href: "/approvals",
    label: "בקשות לאישור",
    icon: "approvals",
    anyOf: ["approvals.view", "approvals.decide"],
    badge: "approvals",
  },
  { href: "/agents", label: "נציגים", icon: "agents", anyOf: ["agents.view"] },
  {
    href: "/transfers",
    label: "העברות נציגים",
    icon: "transfers",
    anyOf: ["transfers.request", "transfers.decide"],
    badge: "transfers",
  },
  { href: "/teams", label: "צוותים", icon: "teams", anyOf: ["teams.manage"] },
  { href: "/users", label: "משתמשים", icon: "users", anyOf: ["users.manage"] },
  { href: "/roles", label: "תפקידים והרשאות", icon: "roles", anyOf: ["roles.manage"] },
  {
    href: "/settings",
    label: "הגדרות",
    icon: "settings",
    anyOf: ["settings.manage", "catalog.manage"],
  },
  { href: "/audit", label: "לוג פעולות", icon: "audit", anyOf: ["audit.view"] },
];
