/**
 * The permission catalog. Code checks permissions by key; which role holds which permission
 * (and with what scope) is data stored in Firestore and editable from the roles screen.
 *
 * To add a feature: add a key here, check it in the service, and grant it to roles in the UI.
 */

export type PermissionScope = "all" | "own_teams";

export interface PermissionDef {
  label: string;
  group: string;
  /** Whether "own teams only" makes sense for this permission. */
  scoped: boolean;
}

export const PERMISSIONS = {
  // מערכת
  "users.manage": { label: "ניהול משתמשים", group: "מערכת", scoped: false },
  "roles.manage": { label: "ניהול תפקידים והרשאות", group: "מערכת", scoped: false },
  "settings.manage": { label: "הגדרות כלליות", group: "מערכת", scoped: false },
  "catalog.manage": {
    label: "ניהול משמרות, מיקומים וסוגי היעדרות",
    group: "מערכת",
    scoped: false,
  },
  "audit.view": { label: "צפייה בלוג פעולות", group: "מערכת", scoped: true },

  // צוותים ונציגים
  "teams.manage": { label: "ניהול צוותים ומנהלי צוותים", group: "צוותים ונציגים", scoped: false },
  "agents.view": { label: "צפייה בנציגים", group: "צוותים ונציגים", scoped: true },
  "agents.manage": { label: "הוספה ועריכה של נציגים", group: "צוותים ונציגים", scoped: true },
  "agents.quota": { label: "קביעת מכסת עבודה מהבית לנציג", group: "צוותים ונציגים", scoped: true },
  "transfers.request": {
    label: "בקשת העברת נציג לצוות שלי",
    group: "צוותים ונציגים",
    scoped: true,
  },
  "transfers.decide": {
    label: "אישור העברת נציג מהצוות שלי",
    group: "צוותים ונציגים",
    scoped: true,
  },

  // סידור עבודה
  "schedule.view": { label: "צפייה בסידור", group: "סידור עבודה", scoped: true },
  "schedule.edit": { label: "עריכת סידור", group: "סידור עבודה", scoped: true },
  "schedule.publish": { label: "פרסום סידור שבועי", group: "סידור עבודה", scoped: true },
  "schedule.editLocked": {
    label: "עריכת שבועות שעברו או שפורסמו",
    group: "סידור עבודה",
    scoped: true,
  },

  // נוכחות
  "attendance.view": { label: "צפייה בנוכחות", group: "נוכחות", scoped: true },
  "attendance.manage": {
    label: "סימון נוכחות, איחורים ומיקום בפועל",
    group: "נוכחות",
    scoped: true,
  },

  // אישורים
  "approvals.view": { label: "צפייה בבקשות לאישור", group: "אישורים", scoped: true },
  "approvals.decide": { label: "אישור ודחייה של חריגים", group: "אישורים", scoped: true },
} as const satisfies Record<string, PermissionDef>;

export type PermissionKey = keyof typeof PERMISSIONS;

export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as PermissionKey[];

export type RolePermissions = Partial<Record<PermissionKey, PermissionScope>>;

/**
 * Permissions added after the first release. A system role created before a key existed gets
 * that key's default grant once (see ensureDefaultRoles); after that the admin's edits stand.
 */
export const LATER_PERMISSION_KEYS: PermissionKey[] = ["attendance.view", "attendance.manage"];

export const SCOPE_LABELS: Record<PermissionScope, string> = {
  all: "כל הצוותים",
  own_teams: "הצוותים שלו בלבד",
};

export const SYSTEM_ROLE_IDS = {
  admin: "admin",
  centerManager: "center_manager",
  teamManager: "team_manager",
  shiftLead: "shift_lead",
} as const;

const ALL = "all" as const;
const OWN = "own_teams" as const;

/** Roles created by bootstrap/seed. The admin role always holds every permission. */
export const DEFAULT_ROLES: Array<{
  id: string;
  name: string;
  description: string;
  permissions: RolePermissions;
}> = [
  {
    id: SYSTEM_ROLE_IDS.admin,
    name: "מנהל מערכת",
    description: "גישה מלאה לכל המערכת",
    permissions: Object.fromEntries(PERMISSION_KEYS.map((k) => [k, ALL])) as RolePermissions,
  },
  {
    id: SYSTEM_ROLE_IDS.centerManager,
    name: "מנהלת מוקד",
    description: "צפייה ועריכה בכל הצוותים, אישור חריגים",
    permissions: {
      "catalog.manage": ALL,
      "audit.view": ALL,
      "teams.manage": ALL,
      "agents.view": ALL,
      "agents.manage": ALL,
      "agents.quota": ALL,
      "transfers.request": ALL,
      "transfers.decide": ALL,
      "schedule.view": ALL,
      "schedule.edit": ALL,
      "schedule.publish": ALL,
      "schedule.editLocked": ALL,
      "approvals.view": ALL,
      "approvals.decide": ALL,
      "attendance.view": ALL,
      "attendance.manage": ALL,
    },
  },
  {
    id: SYSTEM_ROLE_IDS.teamManager,
    name: "מנהל צוות",
    description: "ניהול הנציגים והסידור של הצוותים שלו",
    permissions: {
      "audit.view": OWN,
      "agents.view": OWN,
      "agents.manage": OWN,
      "transfers.request": OWN,
      "transfers.decide": OWN,
      "schedule.view": OWN,
      "schedule.edit": OWN,
      "schedule.publish": OWN,
      "approvals.view": OWN,
      "attendance.view": OWN,
    },
  },
  {
    id: SYSTEM_ROLE_IDS.shiftLead,
    name: "אחמ״ש",
    description: "אחראי/ת משמרת: צפייה בכל הצוותים, נוכחות, אישור חריגים והעברות",
    permissions: {
      "agents.view": ALL,
      "schedule.view": ALL,
      "attendance.view": ALL,
      "attendance.manage": ALL,
      "approvals.view": ALL,
      "approvals.decide": ALL,
      "transfers.request": ALL,
      "transfers.decide": ALL,
    },
  },
];
