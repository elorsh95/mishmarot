import type { IsoDate } from "@/lib/dates";

/** Why the proposal put an agent where it did (shown next to each entry). */
export type ProposalReason =
  | "default"
  | "moved_to_evening"
  | "moved_to_morning"
  | "office_instead_of_home"
  | "no_default_shift";

export const REASON_LABELS: Record<ProposalReason, string> = {
  default: "לפי ברירת המחדל",
  moved_to_evening: "הועבר לערב כדי להשלים את המינימום",
  moved_to_morning: "הועבר לבוקר כדי להשלים את המינימום",
  office_instead_of_home: "במוקד במקום בבית: המכסה נוצלה",
  no_default_shift: "משמרת נבחרה לפי הצורך (אין ברירת מחדל)",
};

export interface ProposedEntry {
  agentId: string;
  date: IsoDate;
  shiftId: string;
  locationId: string;
  reasons: ProposalReason[];
}

export interface DayCoverage {
  date: IsoDate;
  workable: boolean;
  eveningExpected: boolean;
  needMorning: number;
  needEvening: number;
  before: { morning: number; evening: number };
  after: { morning: number; evening: number };
}

export interface FairnessRow {
  agentId: string;
  name: string;
  /** In the look-back weeks before this one. */
  pastEvenings: number;
  pastFridays: number;
  /** This week, after the proposal (existing entries included). */
  weekEvenings: number;
  weekFridays: number;
  weekDays: number;
}

export interface Proposal {
  teamId: string;
  weekStart: IsoDate;
  entries: ProposedEntry[];
  coverage: DayCoverage[];
  fairness: FairnessRow[];
  warnings: string[];
  /** Weeks of history used for fairness. */
  historyWeeks: number;
}

export interface AutoScheduleOptions {
  /** On Fridays and holiday eves, schedule only as many as the minimum needs, rotating fairly. */
  fridayRotation: boolean;
}

/** Weeks back the fairness counts look at. */
export const FAIRNESS_WEEKS = 8;
