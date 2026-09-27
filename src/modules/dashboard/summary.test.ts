import { describe, expect, it } from "vitest";
import { summarizeWeek, weekDays } from "./summary";

const morning = {
  id: "m",
  isActive: true,
  daysOfWeek: [0, 1, 2, 3, 4, 5],
  coversMorning: true,
  coversEvening: false,
};
const evening = {
  id: "e",
  isActive: true,
  daysOfWeek: [0, 1, 2, 3, 4],
  coversMorning: false,
  coversEvening: true,
};
const shifts = [morning, evening];
const entry = (agentId: string, date: string, shiftId: string | null, extra = {}) => ({
  agentId,
  date,
  kind: shiftId ? ("shift" as const) : ("absence" as const),
  shiftId,
  quotaStatus: "none" as const,
  ...extra,
});

describe("week coverage summary", () => {
  it("counts coverage, unassigned agents and gaps per day", () => {
    // Sun 3.3.2030 … Fri 8.3.2030; Tuesday is a holiday
    const days = weekDays(
      [
        "2030-03-03",
        "2030-03-04",
        "2030-03-05",
        "2030-03-06",
        "2030-03-07",
        "2030-03-08",
        "2030-03-09",
      ],
      shifts,
    );
    expect(days).toHaveLength(6);
    const summary = summarizeWeek({
      days,
      dayInfo: { "2030-03-05": { kind: "closed", name: "חג", source: "calendar" } },
      shifts,
      agentIds: ["a", "b"],
      entries: [
        entry("a", "2030-03-03", "m"),
        entry("b", "2030-03-03", "e"),
        entry("a", "2030-03-04", "m"),
        entry("b", "2030-03-04", "e", { quotaStatus: "rejected" }),
        entry("a", "2030-03-06", null),
        entry("a", "2030-03-08", "m"),
      ],
    });
    const [sun, mon, tue, wed, , fri] = summary.days;
    expect(sun).toMatchObject({ morning: 1, evening: 1, unassigned: 0, gap: false });
    // A rejected entry doesn't cover, but the agent is scheduled
    expect(mon).toMatchObject({ morning: 1, evening: 0, unassigned: 0, gap: true });
    expect(tue).toMatchObject({ workable: false, unassigned: 0, gap: false });
    expect(wed).toMatchObject({ absent: 1, unassigned: 1, gap: true });
    // Friday has no evening shift, so no evening is expected
    expect(fri).toMatchObject({ eveningExpected: false, morning: 1, unassigned: 1, gap: false });
    expect(summary.unassigned).toBe(1 + 2 + 1); // wed b, thu a+b, fri b
    expect(summary.gaps).toBe(3); // mon, wed, thu

    const empty = summarizeWeek({ days, dayInfo: {}, shifts, agentIds: [], entries: [] });
    expect(empty).toMatchObject({ agents: 0, gaps: 0, unassigned: 0 });
  });
});
