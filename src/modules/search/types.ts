/** What quick search (Ctrl+K) looks through; loaded once when it opens. */
export interface SearchIndex {
  teams: Array<{ id: string; name: string }>;
  agents: Array<{
    id: string;
    name: string;
    employeeNumber: string;
    teamId: string;
    teamName: string;
    isActive: boolean;
  }>;
}

/** Case, spacing and Hebrew quote marks don't matter when matching. */
export function searchKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/["'`׳״’‘“”.\-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
