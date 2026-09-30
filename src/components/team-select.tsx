"use client";

import { Select } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import {
  activityOptionLabel,
  activityValue,
  ALL_TEAMS,
  groupTeams,
  type Activity,
  type GroupableTeam,
} from "@/modules/teams/types";

/**
 * Team picker grouped by activity: "כל הצוותים", then per activity "כל <activity>" and its teams,
 * then the teams without an activity. Values are a team id, "all" or "act:<id>".
 * The multi-team options appear only when they cover at least two teams.
 */
export function TeamSelect({
  teams,
  activities,
  value,
  onChange,
  allowMulti = true,
  allLabel = "כל הצוותים",
  className,
}: {
  teams: GroupableTeam[];
  activities: Activity[];
  value: string;
  onChange: (value: string) => void;
  /** Offer "all" and the activities (false for screens that show one team at a time). */
  allowMulti?: boolean;
  allLabel?: string;
  className?: string;
}) {
  const groups = groupTeams(teams, activities);
  const grouped = groups.some((g) => g.activity !== null);
  const teamOptions = (list: GroupableTeam[]) =>
    list.map((t) => (
      <option key={t.id} value={t.id}>
        {t.name}
      </option>
    ));

  return (
    <Select
      aria-label="צוות"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn("w-auto min-w-36", className)}
    >
      {allowMulti && teams.length > 1 ? <option value={ALL_TEAMS}>{allLabel}</option> : null}
      {grouped
        ? groups.map((g) => (
            <optgroup key={g.activity?.id ?? "none"} label={g.activity?.name ?? "ללא פעילות"}>
              {allowMulti && g.activity && g.teams.length > 1 ? (
                <option value={activityValue(g.activity.id)}>
                  {activityOptionLabel(g.activity, g.teams.length)}
                </option>
              ) : null}
              {teamOptions(g.teams)}
            </optgroup>
          ))
        : teamOptions(teams)}
    </Select>
  );
}
