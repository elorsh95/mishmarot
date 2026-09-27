import type { IsoDate } from "@/lib/dates";
import type { DayInfo } from "@/modules/calendar/types";

/** A read-only link to a team's published schedule, for agents who have no user. */
export interface ShareLink {
  token: string;
  teamId: string;
  createdByName: string;
  createdAt: string;
}

/** What the public page shows: names and entries only (no notes, numbers or approval details). */
export interface SharedWeek {
  teamName: string;
  weekStart: IsoDate;
  label: string;
  published: boolean;
  days: IsoDate[];
  dayInfo: Record<IsoDate, DayInfo>;
  agents: Array<{ id: string; name: string }>;
  /** Keyed by `${agentId}_${date}`. */
  cells: Record<string, { text: string; sub: string | null; color: string; absence: boolean }>;
}
