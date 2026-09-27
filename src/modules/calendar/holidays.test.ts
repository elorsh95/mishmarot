import { describe, expect, it } from "vitest";
import { calendarDays, calendarDaysFor } from "./holidays";
import { shiftRunsOn, shiftWeekday } from "./types";

describe("Israeli holiday calendar", () => {
  const days = calendarDays("2026-09-01", "2027-06-30");

  it("marks holidays as closed and their eves as Friday-like", () => {
    expect(days["2026-09-11"]).toMatchObject({ kind: "eve", name: "ערב ראש השנה" });
    expect(days["2026-09-12"]).toMatchObject({ kind: "closed", name: "ראש השנה" });
    expect(days["2026-09-13"]).toMatchObject({ kind: "closed", name: "ראש השנה ב׳" });
    expect(days["2026-09-21"]).toMatchObject({ kind: "closed", name: "יום כפור" });
    expect(days["2027-04-21"]).toMatchObject({ kind: "eve", name: "ערב פסח" });
    expect(days["2027-04-27"]).toMatchObject({ kind: "eve", name: "ערב שביעי של פסח" });
    expect(days["2027-04-28"]).toMatchObject({ kind: "closed", name: "פסח ז׳" });
    expect(days["2027-05-11"]).toMatchObject({ kind: "eve", name: "יום הזכרון" });
    expect(days["2027-05-12"]).toMatchObject({ kind: "closed", name: "יום העצמאות" });
    expect(days["2027-06-11"]).toMatchObject({ kind: "closed", name: "שבועות" });
  });

  it("labels Chol HaMoed and minor holidays without changing the work day", () => {
    expect(days["2026-09-28"]).toMatchObject({ kind: "regular", name: "סוכות ג׳ (חוה״מ)" });
    expect(days["2026-12-06"]).toMatchObject({ kind: "regular", name: "חנוכה" });
    expect(days["2027-03-23"]).toMatchObject({ kind: "regular", name: "פורים" });
    expect(days["2026-11-02"]).toBeUndefined();
  });

  it("returns only the requested dates", () => {
    expect(Object.keys(calendarDaysFor(["2026-09-12", "2026-11-02"]))).toEqual(["2026-09-12"]);
  });
});

describe("shift rules on special days", () => {
  const morning = { daysOfWeek: [0, 1, 2, 3, 4, 5] };
  const evening = { daysOfWeek: [0, 1, 2, 3, 4] };
  const tuesday = "2030-04-16";

  it("an eve follows Friday, a closed day allows nothing", () => {
    const eve = { kind: "eve" as const, name: "ערב פסח", source: "calendar" as const };
    const closed = { kind: "closed" as const, name: "פסח", source: "calendar" as const };
    expect(shiftWeekday(tuesday, undefined)).toBe(2);
    expect(shiftWeekday(tuesday, eve)).toBe(5);
    expect(shiftWeekday(tuesday, closed)).toBeNull();
    expect(shiftRunsOn(evening, tuesday, undefined)).toBe(true);
    expect(shiftRunsOn(evening, tuesday, eve)).toBe(false);
    expect(shiftRunsOn(morning, tuesday, eve)).toBe(true);
    expect(shiftRunsOn(morning, tuesday, closed)).toBe(false);
  });
});
