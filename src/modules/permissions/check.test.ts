import { describe, expect, it } from "vitest";
import { can, canForTeam, teamScope, type Actor } from "./check";

const teamManager: Actor = {
  id: "u1",
  fullName: "Test",
  roleId: "team_manager",
  managedTeamIds: ["renault", "dacia"],
  permissions: { "schedule.edit": "own_teams", "schedule.view": "own_teams" },
};

const centerManager: Actor = {
  ...teamManager,
  managedTeamIds: [],
  permissions: { "schedule.edit": "all", "approvals.decide": "all" },
};

describe("permission checks", () => {
  it("own_teams scope allows only managed teams", () => {
    expect(canForTeam(teamManager, "schedule.edit", "renault")).toBe(true);
    expect(canForTeam(teamManager, "schedule.edit", "nissan")).toBe(false);
  });

  it("all scope allows every team", () => {
    expect(canForTeam(centerManager, "schedule.edit", "nissan")).toBe(true);
  });

  it("missing permission denies", () => {
    expect(can(teamManager, "approvals.decide")).toBe(false);
    expect(canForTeam(teamManager, "approvals.decide", "renault")).toBe(false);
  });

  it("teamScope returns managed teams or all", () => {
    expect(teamScope(teamManager, "schedule.view")).toEqual(["renault", "dacia"]);
    expect(teamScope(centerManager, "schedule.edit")).toBe("all");
    expect(teamScope(teamManager, "approvals.decide")).toEqual([]);
  });
});
