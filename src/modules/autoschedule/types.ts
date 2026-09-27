import type { IsoDate } from "@/lib/dates";

/**
 * A rule for one agent in an auto-schedule run, from the manager's free-text instructions
 * (parsed by Claude, see ai.ts) or set directly. `dates` empty = the whole week.
 */
export type ScheduleConstraint =
  | { kind: "off"; agentId: string; dates: IsoDate[] }
  | { kind: "work"; agentId: string; dates: IsoDate[] }
  | { kind: "avoid_shift"; agentId: string; shiftId: string; dates: IsoDate[] }
  | { kind: "only_shift"; agentId: string; shiftId: string; dates: IsoDate[] }
  | { kind: "no_home"; agentId: string; dates: IsoDate[] };

export type ProposalReason =
  | "default"
  | "moved_to_evening"
  | "moved_to_morning"
  | "office_instead_of_home"
  | "extra_day"
  | "no_default_shift";

export const REASON_LABELS: Record<ProposalReason, string> = {
  default: "לפי ברירת המחדל",
  moved_to_evening: "הועבר לערב כדי להשלים את המינימום",
  moved_to_morning: "הועבר לבוקר כדי להשלים את המינימום",
  office_instead_of_home: "במוקד במקום בבית: המכסה נוצלה",
  extra_day: "יום נוסף לפי ההנחיות",
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
  /** Constraints applied, with the instruction text they came from (for display). */
  constraints: ScheduleConstraint[];
  /** Whether Claude read free-text instructions for this proposal. */
  usedAi: boolean;
  /** Weeks of history used for fairness. */
  historyWeeks: number;
}

export interface AutoScheduleOptions {
  /** On Fridays and holiday eves, schedule only as many as the minimum needs, rotating fairly. */
  fridayRotation: boolean;
}
