import { describe, expect, it } from "vitest";
import { solveWeek, type SolverAgent, type SolverInput } from "./solver";

// Week of Sunday 3.3.2030 (Sun–Fri)
const DAYS = ["2030-03-03", "2030-03-04", "2030-03-05", "2030-03-06", "2030-03-07", "2030-03-08"];
const WEEKDAYS = [0, 1, 2, 3, 4];
const shifts = [
  {
    id: "m",
    name: "בוקר",
    daysOfWeek: [0, 1, 2, 3, 4, 5],
    coversMorning: true,
    coversEvening: false,
    isActive: true,
    sortOrder: 1,
  },
  {
    id: "e",
    name: "ערב",
    daysOfWeek: [0, 1, 2, 3, 4],
    coversMorning: false,
    coversEvening: true,
    isActive: true,
    sortOrder: 2,
  },
];
const locations = [
  { id: "office", requiresQuota: false, isActive: true, sortOrder: 1 },
  { id: "home", requiresQuota: true, isActive: true, sortOrder: 2 },
];
const agent = (id: string, extra: Partial<SolverAgent> = {}): SolverAgent => ({
  id,
  name: id,
  defaultShiftId: "m",
  defaultLocationId: "office",
  defaultDays: WEEKDAYS,
  ...extra,
});
const base = (over: Partial<SolverInput> = {}): SolverInput => ({
  days: DAYS,
  dayInfo: {},
  shifts,
  locations,
  agents: [agent("a"), agent("b")],
  existing: [],
  min: { morning: 0, evening: 0 },
  quotaLeft: {},
  periodKeyOf: (d) => d.slice(0, 7),
  history: {},
  options: { fridayRotation: false },
  ...over,
});
const on = (r: ReturnType<typeof solveWeek>, id: string, date: string) =>
  r.entries.find((e) => e.agentId === id && e.date === date);

describe("auto-schedule", () => {
  it("fills each agent's usual days with their defaults", () => {
    const r = solveWeek(base());
    expect(r.entries).toHaveLength(10); // 2 agents × Sun–Thu
    expect(on(r, "a", "2030-03-03")).toMatchObject({
      shiftId: "m",
      locationId: "office",
      reasons: ["default"],
    });
    expect(on(r, "a", "2030-03-08")).toBeUndefined(); // Friday is not a usual day
    expect(r.warnings).toEqual([]);
  });

  it("meets the evening minimum by moving whoever had the fewest evenings", () => {
    const r = solveWeek(
      base({
        agents: [agent("a"), agent("b"), agent("c")],
        min: { morning: 1, evening: 1 },
        history: {
          a: { evenings: 5, fridays: 0 },
          b: { evenings: 1, fridays: 0 },
          c: { evenings: 3, fridays: 0 },
        },
      }),
    );
    // Sunday: b (fewest) goes to the evening
    expect(on(r, "b", "2030-03-03")).toMatchObject({ shiftId: "e", reasons: ["moved_to_evening"] });
    // The evenings rotate as the week goes on, instead of always falling on b
    const evenings = r.entries.filter((e) => e.shiftId === "e").map((e) => e.agentId);
    expect(evenings).toHaveLength(5);
    expect(new Set(evenings).size).toBeGreaterThan(1);
    expect(r.coverage[0].after).toEqual({ morning: 2, evening: 1 });
    // Nobody works Fridays here, and the morning shift runs on Friday
    expect(r.warnings).toEqual(["שישי 8.3: חסרים נציגים בבוקר (0 מתוך 1)"]);
  });

  it("warns instead of forcing when the minimum can't be met", () => {
    const r = solveWeek(base({ agents: [agent("a")], min: { morning: 1, evening: 1 } }));
    expect(on(r, "a", "2030-03-03")?.shiftId).toBe("m"); // the morning keeps its only agent
    expect(r.warnings[0]).toContain("חסרים נציגים בערב (0 מתוך 1)");
  });

  it("uses home days only within the quota, then the office", () => {
    const r = solveWeek(
      base({
        agents: [agent("a", { defaultLocationId: "home" })],
        quotaLeft: { a: { "2030-03": 2 } },
      }),
    );
    const places = DAYS.slice(0, 5).map((d) => on(r, "a", d)?.locationId);
    expect(places).toEqual(["home", "home", "office", "office", "office"]);
    expect(on(r, "a", "2030-03-05")?.reasons).toContain("office_instead_of_home");
  });

  it("keeps existing entries and skips closed days", () => {
    const r = solveWeek(
      base({
        dayInfo: { "2030-03-05": { kind: "closed", name: "חג", source: "calendar" } },
        existing: [
          { agentId: "a", date: "2030-03-03", kind: "absence", shiftId: null, quotaStatus: "none" },
          { agentId: "b", date: "2030-03-03", kind: "shift", shiftId: "e", quotaStatus: "none" },
        ],
      }),
    );
    expect(on(r, "a", "2030-03-03")).toBeUndefined();
    expect(on(r, "b", "2030-03-03")).toBeUndefined();
    expect(r.entries.some((e) => e.date === "2030-03-05")).toBe(false);
    expect(r.coverage.find((c) => c.date === "2030-03-05")?.workable).toBe(false);
    expect(r.coverage[0].before).toEqual({ morning: 0, evening: 1 });
  });

  it("rotates Fridays among the agents who had the fewest", () => {
    const everyDay = [0, 1, 2, 3, 4, 5];
    const r = solveWeek(
      base({
        agents: [
          agent("a", { defaultDays: everyDay }),
          agent("b", { defaultDays: everyDay }),
          agent("c", { defaultDays: everyDay }),
        ],
        min: { morning: 1, evening: 0 },
        history: {
          a: { evenings: 0, fridays: 3 },
          b: { evenings: 0, fridays: 1 },
          c: { evenings: 0, fridays: 2 },
        },
        options: { fridayRotation: true },
      }),
    );
    const friday = r.entries.filter((e) => e.date === "2030-03-08").map((e) => e.agentId);
    expect(friday).toEqual(["b"]);
    expect(r.fairness.find((f) => f.agentId === "b")).toMatchObject({
      pastFridays: 1,
      weekFridays: 1,
    });
  });

  it("places agents without a default shift where they are needed", () => {
    const r = solveWeek(
      base({
        agents: [agent("a"), agent("b", { defaultShiftId: null })],
        min: { morning: 1, evening: 1 },
      }),
    );
    expect(on(r, "b", "2030-03-03")).toMatchObject({ shiftId: "e", reasons: ["no_default_shift"] });
    expect(on(r, "a", "2030-03-03")?.shiftId).toBe("m");
  });
});
