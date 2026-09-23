import type { IsoDate } from "@/lib/dates";
import type { EntryKind, QuotaStatus } from "./types";

/**
 * The monthly quota rule, as a pure function.
 *
 * Within one agent and one calendar month, days at a quota location (e.g. home) are ordered by
 * date. The first `quota` days are within quota; from quota+1 onward each day needs approval.
 *
 * - Ordering is by date, not by entry order, so the result doesn't depend on how the week was filled.
 * - Rejected days don't count (the agent won't work from home that day).
 * - Approved days stay approved even if they later fall within quota, and still count.
 * - A pending day that falls back within quota (an earlier day was removed) is released automatically.
 */

export interface QuotaEntry {
  id: string;
  date: IsoDate;
  kind: EntryKind;
  locationId: string | null;
  quotaStatus: QuotaStatus;
}

export interface QuotaResult {
  status: QuotaStatus;
  /** 1-based index among the month's counted quota days (0 when not counted). */
  position: number;
}

export function isQuotaDay(
  entry: Pick<QuotaEntry, "kind" | "locationId">,
  quotaLocations: Set<string>,
) {
  return (
    entry.kind === "shift" && entry.locationId !== null && quotaLocations.has(entry.locationId)
  );
}

export function computeQuotaStatuses(
  entries: QuotaEntry[],
  quota: number,
  quotaLocations: Set<string>,
): Map<string, QuotaResult> {
  const result = new Map<string, QuotaResult>();
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  let used = 0;
  for (const entry of sorted) {
    if (!isQuotaDay(entry, quotaLocations)) {
      result.set(entry.id, { status: "none", position: 0 });
    } else if (entry.quotaStatus === "rejected") {
      result.set(entry.id, { status: "rejected", position: 0 });
    } else {
      used += 1;
      let status: QuotaStatus;
      if (entry.quotaStatus === "approved") status = "approved";
      else if (used <= quota) status = "within_quota";
      else status = "pending";
      result.set(entry.id, { status, position: used });
    }
  }
  return result;
}

/** Number of counted quota days (within quota, pending or approved). */
export function countUsedQuotaDays(entries: QuotaEntry[], quotaLocations: Set<string>) {
  return entries.filter((e) => isQuotaDay(e, quotaLocations) && e.quotaStatus !== "rejected")
    .length;
}
