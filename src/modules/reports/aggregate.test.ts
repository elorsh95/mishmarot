import { describe, expect, it } from "vitest";
import { aggregateMonth } from "./aggregate";
import { homeDays } from "./types";

const agent = (id: string) => ({
  agentId: id,
  agentName: id,
  employeeNumber: "",
  teamName: "רנו",
  isActive: true,
  quota: 2,
});
const shift = (agentId: string, shiftId: string, locationId: string, quotaStatus = "none") => ({
  agentId,
  kind: "shift" as const,
  shiftId,
  locationId,
  absenceTypeId: null,
  quotaStatus: quotaStatus as "none",
});
const absence = (agentId: string, absenceTypeId: string) => ({
  agentId,
  kind: "absence" as const,
  shiftId: null,
  locationId: null,
  absenceTypeId,
  quotaStatus: "none" as const,
});

describe("monthly aggregation", () => {
  it("counts work days per shift, home days by quota state and absences per type", () => {
    const [a, b] = aggregateMonth(
      [agent("a"), agent("b")],
      [
        shift("a", "morning", "office"),
        shift("a", "evening", "home", "within_quota"),
        shift("a", "morning", "home", "within_quota"),
        shift("a", "morning", "home", "approved"),
        shift("a", "morning", "home", "pending"),
        shift("a", "morning", "home", "rejected"),
        absence("a", "vacation"),
        absence("a", "vacation"),
        absence("a", "sick"),
        shift("ghost", "morning", "office"),
      ],
      new Set(["home"]),
    );
    expect(a.workDays).toBe(6);
    expect(a.byShift).toEqual({ morning: 5, evening: 1 });
    expect(a.home).toEqual({ withinQuota: 2, approved: 1, pending: 1, rejected: 1 });
    expect(homeDays(a)).toBe(3);
    expect(a.byAbsence).toEqual({ vacation: 2, sick: 1 });
    expect(a.absenceDays).toBe(3);
    expect(b).toMatchObject({ workDays: 0, absenceDays: 0 });
  });
});
