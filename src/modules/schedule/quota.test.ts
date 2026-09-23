import { describe, expect, it } from "vitest";
import { computeQuotaStatuses, type QuotaEntry } from "./quota";
import type { QuotaStatus } from "./types";

const HOME = "home";
const OFFICE = "office";
const quotaLocations = new Set([HOME]);

function day(date: string, locationId = HOME, quotaStatus: QuotaStatus = "none"): QuotaEntry {
  return { id: date, date, kind: "shift", locationId, quotaStatus };
}

function statuses(entries: QuotaEntry[], quota = 2) {
  const res = computeQuotaStatuses(entries, quota, quotaLocations);
  return Object.fromEntries([...res].map(([id, r]) => [id, r.status]));
}

describe("computeQuotaStatuses", () => {
  it("first two home days are within quota, the third onward is pending", () => {
    expect(
      statuses([day("2026-09-01"), day("2026-09-08"), day("2026-09-15"), day("2026-09-22")]),
    ).toEqual({
      "2026-09-01": "within_quota",
      "2026-09-08": "within_quota",
      "2026-09-15": "pending",
      "2026-09-22": "pending",
    });
  });

  it("orders by date, not by entry order", () => {
    expect(statuses([day("2026-09-20"), day("2026-09-03"), day("2026-09-10")])).toEqual({
      "2026-09-03": "within_quota",
      "2026-09-10": "within_quota",
      "2026-09-20": "pending",
    });
  });

  it("office days and absences are not counted", () => {
    const entries: QuotaEntry[] = [
      day("2026-09-01", OFFICE),
      day("2026-09-02"),
      { id: "a", date: "2026-09-03", kind: "absence", locationId: null, quotaStatus: "none" },
      day("2026-09-04"),
      day("2026-09-05", OFFICE),
    ];
    expect(statuses(entries)).toEqual({
      "2026-09-01": "none",
      "2026-09-02": "within_quota",
      a: "none",
      "2026-09-04": "within_quota",
      "2026-09-05": "none",
    });
  });

  it("rejected days do not consume quota", () => {
    expect(
      statuses([
        day("2026-09-01"),
        day("2026-09-02", HOME, "rejected"),
        day("2026-09-03"),
        day("2026-09-04"),
      ]),
    ).toEqual({
      "2026-09-01": "within_quota",
      "2026-09-02": "rejected",
      "2026-09-03": "within_quota",
      "2026-09-04": "pending",
    });
  });

  it("approved days stay approved and still count", () => {
    const res = computeQuotaStatuses(
      [day("2026-09-01", HOME, "approved"), day("2026-09-02"), day("2026-09-03")],
      2,
      quotaLocations,
    );
    expect(res.get("2026-09-01")).toEqual({ status: "approved", position: 1 });
    expect(res.get("2026-09-02")).toEqual({ status: "within_quota", position: 2 });
    expect(res.get("2026-09-03")).toEqual({ status: "pending", position: 3 });
  });

  it("a pending day is released when an earlier day is removed", () => {
    const before = [day("2026-09-01"), day("2026-09-02"), day("2026-09-03", HOME, "pending")];
    expect(statuses(before)["2026-09-03"]).toBe("pending");
    expect(statuses(before.slice(1))["2026-09-03"]).toBe("within_quota");
  });

  it("respects a per-agent quota", () => {
    expect(statuses([day("2026-09-01"), day("2026-09-02")], 0)).toEqual({
      "2026-09-01": "pending",
      "2026-09-02": "pending",
    });
    expect(statuses([day("2026-09-01"), day("2026-09-02"), day("2026-09-03")], 5)).toEqual({
      "2026-09-01": "within_quota",
      "2026-09-02": "within_quota",
      "2026-09-03": "within_quota",
    });
  });

  it("reports the position of each counted day", () => {
    const res = computeQuotaStatuses(
      [day("2026-09-01"), day("2026-09-02", OFFICE), day("2026-09-03")],
      2,
      quotaLocations,
    );
    expect(res.get("2026-09-03")?.position).toBe(2);
    expect(res.get("2026-09-02")?.position).toBe(0);
  });
});
