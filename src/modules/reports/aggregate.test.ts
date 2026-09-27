import { describe, expect, it } from "vitest";
import { aggregateAgents, aggregateShifts } from "./aggregate";
import { homeDays, shiftAverage } from "./types";

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

describe("agent aggregation", () => {
  it("counts work days per shift, home days by quota state and absences per type", () => {
    const [a, b] = aggregateAgents(
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

describe("shift aggregation", () => {
  const on = <T extends object>(date: string, e: T) => ({ ...e, date });
  it("counts each shift by location and weekday, with distinct agents and days", () => {
    const { shiftRows, absenceRows } = aggregateShifts(
      [
        { id: "morning", name: "בוקר" },
        { id: "evening", name: "ערב" },
        { id: "night", name: "לילה" },
      ],
      [{ id: "vacation", name: "חופשה" }],
      [
        on("2030-03-03", shift("a", "morning", "office")), // Sunday
        on("2030-03-03", shift("b", "morning", "home", "pending")),
        on("2030-03-04", shift("a", "morning", "home", "rejected")), // Monday
        on("2030-03-04", shift("b", "evening", "office")),
        on("2030-03-05", absence("a", "vacation")),
        on("2030-03-06", absence("a", "vacation")),
        on("2030-03-06", shift("x", "unknown", "office")),
      ],
    );
    const [morning, evening, night] = shiftRows;
    expect(morning).toMatchObject({ total: 3, agents: 2, days: 2, pending: 1, rejected: 1 });
    expect(morning.byLocation).toEqual({ office: 1, home: 2 });
    expect(morning.byWeekday).toEqual([2, 1, 0, 0, 0, 0, 0]);
    expect(shiftAverage(morning)).toBe(1.5);
    expect(evening).toMatchObject({ total: 1, agents: 1, days: 1 });
    expect(night).toMatchObject({ total: 0, agents: 0, days: 0 });
    expect(shiftAverage(night)).toBe(0);
    expect(absenceRows).toEqual([{ absenceTypeId: "vacation", name: "חופשה", days: 2, agents: 1 }]);
  });
});
