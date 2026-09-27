import { describe, expect, it } from "vitest";
import { currentShift, formatMinutes, minutesOff, summarizeAttendance } from "./types";

const morning = {
  id: "m",
  startTime: "08:00",
  endTime: "16:00",
  coversMorning: true,
  coversEvening: false,
};
const evening = {
  id: "e",
  startTime: "14:00",
  endTime: "22:00",
  coversMorning: false,
  coversEvening: true,
};
const night = {
  id: "n",
  startTime: "22:00",
  endTime: "06:00",
  coversMorning: false,
  coversEvening: true,
};

describe("attendance helpers", () => {
  it("computes minutes late and minutes left early", () => {
    expect(minutesOff(morning, "arrival", "08:25")).toBe(25);
    expect(minutesOff(morning, "arrival", "07:50")).toBe(0);
    expect(minutesOff(morning, "departure", "15:00")).toBe(60);
    expect(minutesOff(morning, "none", "15:00")).toBeNull();
    expect(minutesOff({ startTime: null, endTime: null }, "arrival", "08:25")).toBeNull();
  });

  it("finds the shift running now, preferring the one that started last", () => {
    const shifts = [morning, evening, night];
    expect(currentShift(shifts, "09:00")?.id).toBe("m");
    expect(currentShift(shifts, "15:00")?.id).toBe("e");
    expect(currentShift(shifts, "23:30")?.id).toBe("n");
    expect(currentShift(shifts, "03:00")?.id).toBe("n");
  });

  it("falls back to morning / evening when shifts have no hours", () => {
    const untimed = [
      { ...morning, startTime: null, endTime: null },
      { ...evening, startTime: null, endTime: null },
    ];
    expect(currentShift(untimed, "10:00")?.id).toBe("m");
    expect(currentShift(untimed, "18:00")?.id).toBe("e");
    expect(currentShift([], "10:00")).toBeNull();
  });

  it("summarizes marked, late, absent and unmarked rows", () => {
    const statuses = [
      { id: "came", presence: "present" as const, timeField: "none" as const },
      { id: "late", presence: "present" as const, timeField: "arrival" as const },
      { id: "no", presence: "absent" as const, timeField: "none" as const },
    ];
    const rec = (statusId: string) => ({ statusId }) as never;
    const summary = summarizeAttendance(
      [
        { record: rec("came"), unscheduled: false },
        { record: rec("late"), unscheduled: false },
        { record: rec("no"), unscheduled: false },
        { record: null, unscheduled: false },
        { record: rec("came"), unscheduled: true },
      ],
      statuses,
    );
    expect(summary).toEqual({ planned: 4, present: 3, absent: 1, late: 1, unmarked: 1 });
  });

  it("formats minutes", () => {
    expect(formatMinutes(25)).toBe("25 דק׳");
    expect(formatMinutes(60)).toBe("1 ש׳");
    expect(formatMinutes(95)).toBe("1:35 ש׳");
  });
});
