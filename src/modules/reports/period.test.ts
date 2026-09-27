import { describe, expect, it } from "vitest";
import {
  parseReportRange,
  presetRange,
  REPORT_MAX_DAYS,
  reportRangeLabel,
  reportRangeParams,
  stepRange,
} from "./period";

const today = "2030-03-12"; // Tuesday

describe("report ranges", () => {
  it("builds the preset around a date", () => {
    expect(presetRange("day", today)).toEqual({ period: "day", from: today, to: today });
    expect(presetRange("week", today)).toMatchObject({ from: "2030-03-10", to: "2030-03-16" });
    expect(presetRange("month", today)).toMatchObject({ from: "2030-03-01", to: "2030-03-31" });
    expect(presetRange("quarter", today)).toMatchObject({ from: "2030-01-01", to: "2030-03-31" });
  });

  it("parses URL params, falling back to this month", () => {
    expect(parseReportRange({}, today)).toEqual(presetRange("month", today));
    expect(parseReportRange({ month: "2030-01" }, today)).toEqual(
      presetRange("month", "2030-01-01"),
    );
    expect(parseReportRange({ period: "week", date: "2030-03-20" }, today)).toMatchObject({
      from: "2030-03-17",
    });
    expect(parseReportRange({ period: "day", date: "bad" }, today)).toMatchObject({ from: today });
    // A reversed range is swapped, an overlong one is cut.
    expect(
      parseReportRange({ period: "range", from: "2030-03-20", to: "2030-03-05" }, today),
    ).toEqual({ period: "range", from: "2030-03-05", to: "2030-03-20" });
    const long = parseReportRange({ period: "range", from: "2030-01-01", to: "2032-01-01" }, today);
    expect(long.to).toBe("2031-01-01");
    expect(REPORT_MAX_DAYS).toBe(366);
    expect(parseReportRange({ period: "range", from: "2030-01-01" }, today).period).toBe("month");
  });

  it("round-trips through URL params", () => {
    for (const range of [
      presetRange("quarter", today),
      presetRange("week", today),
      { period: "range" as const, from: "2030-03-02", to: "2030-03-09" },
    ]) {
      expect(parseReportRange(reportRangeParams(range), "2000-01-01")).toEqual(range);
    }
  });

  it("steps to the neighbouring period", () => {
    expect(stepRange(presetRange("day", today), 1).from).toBe("2030-03-13");
    expect(stepRange(presetRange("week", today), -1).from).toBe("2030-03-03");
    expect(stepRange(presetRange("month", "2030-01-31"), -1)).toMatchObject({
      from: "2029-12-01",
      to: "2029-12-31",
    });
    expect(stepRange(presetRange("quarter", today), 1)).toMatchObject({
      from: "2030-04-01",
      to: "2030-06-30",
    });
    expect(stepRange({ period: "range", from: "2030-03-01", to: "2030-03-10" }, 1)).toMatchObject({
      from: "2030-03-11",
      to: "2030-03-20",
    });
  });

  it("labels each period in Hebrew", () => {
    expect(reportRangeLabel(presetRange("month", today))).toBe("מרץ 2030");
    expect(reportRangeLabel(presetRange("quarter", today))).toBe("ינואר – מרץ 2030");
    expect(reportRangeLabel({ period: "range", from: "2030-03-01", to: "2030-03-10" })).toBe(
      "01/03/2030 – 10/03/2030",
    );
  });
});
