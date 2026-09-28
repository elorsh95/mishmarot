/** How long data is kept (settings/retention). Client-safe. */

export interface RetentionSettings {
  /** Audit log of changes. The regulations require at least 24 months. */
  auditMonths: number;
  /** Access log (views, exports, refused access). At least 24 months. */
  accessMonths: number;
  /** Attendance records. */
  attendanceMonths: number;
  /** Schedule history: assignments, approval requests and week statuses. */
  scheduleMonths: number;
  /** Agents who left: name, employee number and notes are erased after this long. */
  formerAgentMonths: number;
}

export const DEFAULT_RETENTION: RetentionSettings = {
  auditMonths: 24,
  accessMonths: 24,
  attendanceMonths: 24,
  scheduleMonths: 36,
  formerAgentMonths: 24,
};

export const RETENTION_LIMITS: Record<keyof RetentionSettings, { min: number; max: number }> = {
  auditMonths: { min: 24, max: 120 },
  accessMonths: { min: 24, max: 120 },
  attendanceMonths: { min: 3, max: 120 },
  scheduleMonths: { min: 12, max: 120 },
  formerAgentMonths: { min: 3, max: 120 },
};

export const RETENTION_LABELS: Record<keyof RetentionSettings, { label: string; hint: string }> = {
  auditMonths: { label: "לוג שינויים", hint: "לפי התקנות: לפחות 24 חודשים" },
  accessMonths: { label: "לוג גישה וצפייה", hint: "לפי התקנות: לפחות 24 חודשים" },
  attendanceMonths: { label: "נוכחות", hint: "סימוני נוכחות, איחורים והערות" },
  scheduleMonths: {
    label: "היסטוריית סידור",
    hint: "שיבוצים, בקשות אישור וסטטוס שבועות. דוחות לתקופה שנמחקה יהיו ריקים",
  },
  formerAgentMonths: {
    label: "נציגים שעזבו",
    hint: "אחרי תקופה זו מתוך שהנציג הושבת, השם, מספר העובד וההערות נמחקים",
  },
};

export interface RetentionResult {
  auditLogs: number;
  accessLogs: number;
  attendance: number;
  assignments: number;
  approvals: number;
  weeks: number;
  formerAgents: number;
  loginChallenges: number;
}

export const RESULT_LABELS: Record<keyof RetentionResult, string> = {
  auditLogs: "רשומות לוג שינויים",
  accessLogs: "רשומות לוג גישה",
  attendance: "סימוני נוכחות",
  assignments: "שיבוצים",
  approvals: "בקשות אישור",
  weeks: "סטטוסי שבוע",
  formerAgents: "נציגים שעזבו (מחיקת פרטים)",
  loginChallenges: "ניסיונות התחברות שפג תוקפם",
};
