import { describe, expect, it } from "vitest";
import {
  homeCount,
  officeCount,
  poolStatus,
  poolWeek,
  seatStatus,
  seatUsage,
  seatUsageByGroup,
} from "./seats";
import type { QuotaStatus } from "./types";

const shifts = [
  { id: "m", coversMorning: true, coversEvening: false },
  { id: "e", coversMorning: false, coversEvening: true },
  { id: "d", coversMorning: true, coversEvening: true },
];
const locations = [
  { id: "office", capacity: 2, requiresQuota: false, isActive: true },
  { id: "home", capacity: null, requiresQuota: true, isActive: true },
];
const entry = (
  date: string,
  shiftId: string,
  locationId: string,
  quotaStatus: QuotaStatus = "none",
) => ({ date, kind: "shift", shiftId, locationId, quotaStatus }) as const;

describe("seat usage", () => {
  it("counts each location per half day, a double shift in both", () => {
    const usage = seatUsage(
      [
        entry("2030-03-03", "m", "office"),
        entry("2030-03-03", "d", "office"),
        entry("2030-03-03", "m", "office"),
        entry("2030-03-03", "e", "home"),
        entry("2030-03-03", "m", "home", "rejected"),
        {
          date: "2030-03-03",
          kind: "absence",
          shiftId: null,
          locationId: null,
          quotaStatus: "none",
        },
      ],
      shifts,
    );
    expect(usage["2030-03-03"]).toEqual({
      morning: { office: 3 },
      evening: { office: 1, home: 1 },
    });
    expect(seatStatus(usage, "2030-03-03", "morning", locations)).toEqual([
      { locationId: "office", used: 3, capacity: 2, over: 1, free: 0 },
    ]);
    expect(seatStatus(usage, "2030-03-03", "evening", locations)[0].free).toBe(1);
    expect(homeCount(usage, "2030-03-03", "evening", locations)).toBe(1);
    expect(homeCount(usage, "2030-03-04", "morning", locations)).toBe(0);
  });
});

describe("activity seats", () => {
  const teamEntry = (teamId: string, date: string, shiftId: string, locationId: string) => ({
    ...entry(date, shiftId, locationId),
    teamId,
  });
  const groupOf = (teamId: string) =>
    ({ renault: "new", nissan: "new", leasing: "pacific" })[teamId] ?? null;

  it("splits usage by activity, leaving out teams without one", () => {
    const byGroup = seatUsageByGroup(
      [
        teamEntry("renault", "2030-03-03", "m", "office"),
        teamEntry("nissan", "2030-03-03", "d", "office"),
        teamEntry("leasing", "2030-03-03", "m", "home"),
        teamEntry("digital", "2030-03-03", "m", "office"),
      ],
      shifts,
      groupOf,
    );
    expect(Object.keys(byGroup).sort()).toEqual(["new", "pacific"]);
    expect(byGroup.new["2030-03-03"].morning.office).toBe(2);
    expect(byGroup.new["2030-03-03"].evening.office).toBe(1);
    expect(officeCount(byGroup.pacific, "2030-03-03", "morning", locations)).toBe(0);
  });

  it("checks the activity's own seat count and sums the week", () => {
    const usage = seatUsage(
      [
        entry("2030-03-03", "m", "office"),
        entry("2030-03-03", "m", "office"),
        entry("2030-03-03", "m", "office"),
        entry("2030-03-04", "m", "office"),
        entry("2030-03-04", "m", "home"),
      ],
      shifts,
    );
    expect(poolStatus(usage, "2030-03-03", "morning", 2, locations)).toEqual({
      used: 3,
      capacity: 2,
      over: 1,
      free: 0,
      home: 0,
    });
    const week = poolWeek(
      usage,
      [
        { date: "2030-03-03", workable: true, eveningExpected: false },
        { date: "2030-03-04", workable: true, eveningExpected: false },
        { date: "2030-03-08", workable: false, eveningExpected: false },
      ],
      2,
      locations,
    );
    expect(week.peak).toBe(3);
    expect(week.overDays).toBe(1);
    expect(week.underusedDays).toBe(1);
    expect(week.averagePct).toBe(100); // (150% + 50%) / 2
    expect(week.days[2].morning).toBeNull();
  });
});
