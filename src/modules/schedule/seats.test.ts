import { describe, expect, it } from "vitest";
import { homeCount, seatStatus, seatUsage } from "./seats";
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
