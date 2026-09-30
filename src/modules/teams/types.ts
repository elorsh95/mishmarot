/** A line of business that groups several teams (e.g. "רכב חדש"), to view them together. */
export interface Activity {
  id: string;
  name: string;
  sortOrder: number;
}

/** The minimum a team needs for grouping; `Team` satisfies it. */
export interface GroupableTeam {
  id: string;
  name: string;
  activityId: string | null;
}

/** The team-selection value for every team the user can see. */
export const ALL_TEAMS = "all";
const ACTIVITY_PREFIX = "act:";

/** The team-selection value (URL `team` param) that shows every team of an activity. */
export const activityValue = (activityId: string) => `${ACTIVITY_PREFIX}${activityId}`;

/** Whether a selection value names one team (not "all" or an activity). */
export const isTeamValue = (value: string | null | undefined): value is string =>
  !!value && value !== ALL_TEAMS && !value.startsWith(ACTIVITY_PREFIX);

export interface TeamGroup<T extends GroupableTeam> {
  /** null for the teams that belong to no activity (listed last). */
  activity: Activity | null;
  teams: T[];
}

/** The teams grouped by activity, in the activities' order; the teams keep their own order. */
export function groupTeams<T extends GroupableTeam>(
  teams: T[],
  activities: Activity[],
): TeamGroup<T>[] {
  const known = new Set(activities.map((a) => a.id));
  const groups: TeamGroup<T>[] = activities.map((activity) => ({
    activity,
    teams: teams.filter((t) => t.activityId === activity.id),
  }));
  groups.push({
    activity: null,
    teams: teams.filter((t) => !t.activityId || !known.has(t.activityId)),
  });
  return groups.filter((g) => g.teams.length > 0);
}

/** Whether any of the teams belongs to an activity, i.e. grouping is worth showing. */
export const hasGroups = (teams: GroupableTeam[], activities: Activity[]) =>
  groupTeams(teams, activities).some((g) => g.activity !== null);

/**
 * Activities worth offering as a selection: the ones with at least two of the given teams (with a
 * single team it is the same as picking that team).
 */
export function selectableActivities<T extends GroupableTeam>(
  teams: T[],
  activities: Activity[],
): TeamGroup<T>[] {
  return groupTeams(teams, activities).filter((g) => g.activity !== null && g.teams.length > 1);
}

export type TeamSelection<T extends GroupableTeam> =
  | { kind: "team"; value: string; team: T; label: string }
  | {
      kind: "multi";
      value: string;
      teams: T[];
      /** Hebrew label, e.g. "כל הצוותים" or "רכב חדש". */
      label: string;
      /** The activity shown, or null for every team. */
      activity: Activity | null;
    };

/**
 * Resolves a team-selection value (a team id, "all" or "act:<id>") against the teams the user can
 * see. Returns null when it matches nothing, so the caller can fall back to its default.
 * "all" and an activity need at least two visible teams; otherwise they resolve to the one team.
 */
export function resolveTeamSelection<T extends GroupableTeam>(
  value: string | null | undefined,
  teams: T[],
  activities: Activity[],
): TeamSelection<T> | null {
  if (!value) return null;
  const single = (team: T): TeamSelection<T> => ({
    kind: "team",
    value: team.id,
    team,
    label: team.name,
  });
  if (value === ALL_TEAMS) {
    if (teams.length === 0) return null;
    if (teams.length === 1) return single(teams[0]);
    return { kind: "multi", value, teams, label: "כל הצוותים", activity: null };
  }
  if (value.startsWith(ACTIVITY_PREFIX)) {
    const activity = activities.find((a) => a.id === value.slice(ACTIVITY_PREFIX.length));
    if (!activity) return null;
    const members = teams.filter((t) => t.activityId === activity.id);
    if (members.length === 0) return null;
    if (members.length === 1) return single(members[0]);
    return { kind: "multi", value, teams: members, label: activity.name, activity };
  }
  const team = teams.find((t) => t.id === value);
  return team ? single(team) : null;
}

/** The team ids a selection covers. */
export const selectionTeamIds = (selection: TeamSelection<GroupableTeam>) =>
  selection.kind === "team" ? [selection.team.id] : selection.teams.map((t) => t.id);

/** Hebrew label of a multi-team selection with its size: "כל רכב חדש (5 צוותים)". */
export const activityOptionLabel = (activity: Activity, count: number) =>
  `כל ${activity.name} (${count} צוותים)`;
