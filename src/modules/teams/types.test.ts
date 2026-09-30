import { describe, expect, it } from "vitest";
import {
  activityValue,
  groupTeams,
  isTeamValue,
  resolveTeamSelection,
  selectableActivities,
  selectionTeamIds,
  type Activity,
} from "./types";

const activities: Activity[] = [
  { id: "pacific", name: "פסיפיק", sortOrder: 2 },
  { id: "new", name: "רכב חדש", sortOrder: 1 },
].sort((a, b) => a.sortOrder - b.sortOrder);
const teams = [
  { id: "renault", name: "רנו", activityId: "new" },
  { id: "nissan", name: "ניסאן", activityId: "new" },
  { id: "leasing", name: "ליסינג", activityId: "pacific" },
  { id: "digital", name: "דיגיטל", activityId: null },
  { id: "old", name: "ישן", activityId: "deleted-activity" },
];

describe("groupTeams", () => {
  it("groups by activity in the activities' order, teams without one last", () => {
    const groups = groupTeams(teams, activities);
    expect(groups.map((g) => [g.activity?.id ?? null, g.teams.map((t) => t.id)])).toEqual([
      ["new", ["renault", "nissan"]],
      ["pacific", ["leasing"]],
      [null, ["digital", "old"]],
    ]);
  });

  it("drops activities with none of the teams", () => {
    expect(groupTeams([teams[3]], activities).map((g) => g.activity)).toEqual([null]);
  });

  it("offers only activities with at least two of the teams", () => {
    expect(selectableActivities(teams, activities).map((g) => g.activity?.id)).toEqual(["new"]);
  });
});

describe("resolveTeamSelection", () => {
  it("resolves a team id", () => {
    const s = resolveTeamSelection("digital", teams, activities);
    expect(s).toMatchObject({ kind: "team", value: "digital", label: "דיגיטל" });
  });

  it("resolves every team", () => {
    const s = resolveTeamSelection("all", teams, activities)!;
    expect(s).toMatchObject({ kind: "multi", label: "כל הצוותים", activity: null });
    expect(selectionTeamIds(s)).toHaveLength(5);
  });

  it("resolves an activity to its teams", () => {
    const s = resolveTeamSelection(activityValue("new"), teams, activities)!;
    expect(s).toMatchObject({ kind: "multi", value: "act:new", label: "רכב חדש" });
    expect(selectionTeamIds(s)).toEqual(["renault", "nissan"]);
  });

  it("treats an activity or 'all' with one visible team as that team", () => {
    expect(resolveTeamSelection("act:pacific", teams, activities)).toMatchObject({
      kind: "team",
      value: "leasing",
    });
    expect(resolveTeamSelection("all", [teams[0]], activities)).toMatchObject({
      kind: "team",
      value: "renault",
    });
  });

  it("returns null for unknown or empty values", () => {
    expect(resolveTeamSelection("nope", teams, activities)).toBeNull();
    expect(resolveTeamSelection("act:nope", teams, activities)).toBeNull();
    expect(resolveTeamSelection(activityValue("new"), [teams[3]], activities)).toBeNull();
    expect(resolveTeamSelection(undefined, teams, activities)).toBeNull();
    expect(resolveTeamSelection("all", [], activities)).toBeNull();
  });

  it("tells a single team value apart", () => {
    expect(isTeamValue("renault")).toBe(true);
    expect(isTeamValue("all")).toBe(false);
    expect(isTeamValue("act:new")).toBe(false);
    expect(isTeamValue("")).toBe(false);
  });
});
