import type { PermissionKey } from "@/modules/permissions/catalog";

export type NavIcon =
  | "home"
  | "calendar"
  | "attendance"
  | "approvals"
  | "agents"
  | "transfers"
  | "teams"
  | "users"
  | "roles"
  | "settings"
  | "reports"
  | "audit";

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
  /** Shown if the user holds any of these permissions (empty = everyone). */
  anyOf: PermissionKey[];
  badge?: "approvals" | "transfers";
  /** Day-to-day work, or system administration (shown under its own heading). */
  group: NavGroup;
}

export type NavGroup = "work" | "admin";

export const NAV_GROUP_LABELS: Record<NavGroup, string> = {
  work: "עבודה שוטפת",
  admin: "ניהול",
};

/** The navigation menu. New screens are added here. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "ראשי", icon: "home", anyOf: [], group: "work" },
  {
    href: "/schedule",
    label: "סידור עבודה",
    icon: "calendar",
    anyOf: ["schedule.view"],
    group: "work",
  },
  {
    href: "/attendance",
    label: "נוכחות",
    icon: "attendance",
    anyOf: ["attendance.view"],
    group: "work",
  },
  {
    href: "/approvals",
    label: "בקשות לאישור",
    icon: "approvals",
    anyOf: ["approvals.view", "approvals.decide"],
    badge: "approvals",
    group: "work",
  },
  { href: "/agents", label: "נציגים", icon: "agents", anyOf: ["agents.view"], group: "work" },
  { href: "/reports", label: "דוחות", icon: "reports", anyOf: ["schedule.view"], group: "work" },
  {
    href: "/transfers",
    label: "העברות נציגים",
    icon: "transfers",
    anyOf: ["transfers.request", "transfers.decide"],
    badge: "transfers",
    group: "work",
  },
  { href: "/teams", label: "צוותים", icon: "teams", anyOf: ["teams.manage"], group: "admin" },
  { href: "/users", label: "משתמשים", icon: "users", anyOf: ["users.manage"], group: "admin" },
  {
    href: "/roles",
    label: "תפקידים והרשאות",
    icon: "roles",
    anyOf: ["roles.manage"],
    group: "admin",
  },
  {
    href: "/settings",
    label: "הגדרות",
    icon: "settings",
    anyOf: ["settings.manage", "catalog.manage"],
    group: "admin",
  },
  { href: "/audit", label: "לוג פעולות", icon: "audit", anyOf: ["audit.view"], group: "admin" },
];
