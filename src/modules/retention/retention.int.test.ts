import { Timestamp } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";
import { col, COLLECTIONS } from "@/lib/firebase/collections";
import { listAccess, logAccess } from "@/modules/access/service";
import { markPermissionsReviewed, permissionReview } from "@/modules/security/service";
import { actors, baseData, clearEmulator, createAgentDoc, createTeamDoc } from "@/test/helpers";
import { cutoffDate, getRetention, runRetention, updateRetention } from "./service";

const NOW = new Date();
const ts = (iso: string) => Timestamp.fromDate(new Date(iso));
/** A date `n` months before now, as YYYY-MM-DD. */
const ago = (n: number) => {
  const d = new Date(NOW);
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 10);
};

beforeEach(async () => {
  await clearEmulator();
  await baseData();
  await createTeamDoc("renault", "רנו", ["tm-user"]);
});

describe("retention", () => {
  it("computes the first day kept", () => {
    expect(cutoffDate("2030-06-15", 24)).toBe("2028-06-15");
    expect(cutoffDate("2030-03-31", 1)).toBe("2030-02-28");
  });

  it("refuses to keep logs for less than 24 months", async () => {
    await expect(updateRetention(actors.admin(), { auditMonths: 12 } as never)).rejects.toThrow(
      "24",
    );
  });

  it("previews, then deletes old data and erases agents who left long ago", async () => {
    await updateRetention(actors.admin(), {
      auditMonths: 24,
      accessMonths: 24,
      attendanceMonths: 12,
      scheduleMonths: 36,
      formerAgentMonths: 24,
    });
    await col(COLLECTIONS.auditLogs).add({ summary: "ישן", createdAt: ts(ago(30)) });
    await col(COLLECTIONS.auditLogs).add({ summary: "חדש", createdAt: ts(ago(6)) });
    await col(COLLECTIONS.accessLogs).add({ detail: "ישן", createdAt: ts(ago(40)) });
    await col(COLLECTIONS.attendance)
      .doc("old")
      .set({ date: ago(18) });
    await col(COLLECTIONS.attendance)
      .doc("new")
      .set({ date: ago(2) });
    await col(COLLECTIONS.assignments)
      .doc("old")
      .set({ date: ago(40) });
    await col(COLLECTIONS.weeks)
      .doc("old")
      .set({ weekStart: ago(40) });
    await createAgentDoc("gone", "renault", {
      isActive: false,
      firstName: "יוסי",
      employeeNumber: "555",
      updatedAt: ts(ago(30)),
    });
    await createAgentDoc("left-recently", "renault", {
      isActive: false,
      updatedAt: ts(ago(1)),
    });

    const preview = await runRetention(actors.admin(), { dryRun: true, now: NOW });
    expect(preview).toMatchObject({
      auditLogs: 1,
      accessLogs: 1,
      attendance: 1,
      assignments: 1,
      weeks: 1,
      formerAgents: 1,
    });
    // The preview deletes nothing (2 seeded entries + the policy change)
    expect((await col(COLLECTIONS.auditLogs).get()).size).toBe(3);

    const done = await runRetention(actors.admin(), { now: NOW });
    expect(done).toEqual(preview);
    const summaries = (await col(COLLECTIONS.auditLogs).get()).docs.map((d) => d.get("summary"));
    expect(summaries).toContain("חדש");
    expect(summaries).not.toContain("ישן");
    expect((await col(COLLECTIONS.attendance).get()).size).toBe(1);
    const gone = (await col(COLLECTIONS.agents).doc("gone").get()).data()!;
    expect(gone.employeeNumber).toBe("");
    expect(gone.firstName).not.toBe("יוסי");
    expect(
      (await col(COLLECTIONS.agents).doc("left-recently").get()).get("anonymizedAt"),
    ).toBeUndefined();
    expect((await getRetention()).lastResult).toEqual(done);

    await expect(runRetention(actors.teamManager(["renault"]))).rejects.toThrow();
  });
});

describe("access log", () => {
  it("logs views once per few minutes, and scopes team managers to their teams", async () => {
    const admin = actors.admin();
    await logAccess(admin, {
      action: "view",
      resource: "schedule",
      detail: "רנו",
      teamId: "renault",
    });
    await logAccess(admin, {
      action: "view",
      resource: "schedule",
      detail: "רנו",
      teamId: "renault",
    });
    await logAccess(admin, {
      action: "export",
      resource: "schedule",
      detail: "אקסל",
      teamId: "other",
    });
    await logAccess(admin, { action: "denied", resource: "page", detail: "משתמשים" });
    const all = await listAccess(admin);
    expect(all.map((e) => e.action).sort()).toEqual(["denied", "export", "view"]);
    expect((await listAccess(admin, { action: "export" })).length).toBe(1);

    const tm = {
      ...actors.teamManager(["renault"]),
      permissions: { "audit.view": "own_teams" as const },
    };
    expect((await listAccess(tm)).map((e) => e.detail)).toEqual(["רנו"]);
  });
});

describe("permissions review", () => {
  it("flags idle users and admins without 2FA, and records the review", async () => {
    await col(COLLECTIONS.users)
      .doc("old")
      .set({
        username: "old",
        fullName: "ותיק",
        roleId: "team_manager",
        isActive: true,
        lastLoginAt: ts("2020-01-01"),
        createdAt: ts("2020-01-01"),
      });
    await col(COLLECTIONS.users).doc("boss").set({
      username: "boss",
      fullName: "מנהל",
      roleId: "admin",
      isActive: true,
      lastLoginAt: Timestamp.now(),
      createdAt: Timestamp.now(),
    });
    const { rows, lastReview } = await permissionReview(actors.admin());
    expect(lastReview).toBeNull();
    expect(rows.find((r) => r.userId === "old")?.flags[0]).toContain("לא התחבר");
    expect(rows.find((r) => r.userId === "boss")?.flags).toEqual([
      "הרשאות ניהול בלי אימות דו-שלבי",
    ]);
    expect(rows.find((r) => r.userId === "boss")?.permissions.length).toBeGreaterThan(10);

    await markPermissionsReviewed(actors.admin(), "הושבתו 2 משתמשים");
    expect((await permissionReview(actors.admin())).lastReview?.byName).toBe("admin-user");
    await expect(permissionReview(actors.teamManager([]))).rejects.toThrow();
  });
});
