import { FieldValue } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";
import { addDays, todayIso } from "@/lib/dates";
import { col, COLLECTIONS } from "@/lib/firebase/collections";
import { listAttendanceStatuses } from "@/modules/catalog/service";
import { DEFAULT_ROLES, SYSTEM_ROLE_IDS } from "@/modules/permissions/catalog";
import type { Actor } from "@/modules/permissions/check";
import { ensureDefaultRoles } from "@/modules/roles/service";
import { setDayEntry } from "@/modules/schedule/service";
import { actors, baseData, clearEmulator, createAgentDoc, createTeamDoc } from "@/test/helpers";
import { attendanceId, clearAttendance, getAttendanceDay, recordAttendance } from "./service";

let base: Awaited<ReturnType<typeof baseData>>;
let status: Record<string, string>;
const DAY = "2026-03-02"; // a Monday in the past

const shiftLead = (): Actor => {
  const role = DEFAULT_ROLES.find((r) => r.id === SYSTEM_ROLE_IDS.shiftLead)!;
  return {
    id: "lead",
    fullName: "אחמ״שית",
    roleId: role.id,
    permissions: role.permissions,
    managedTeamIds: [],
  };
};

beforeEach(async () => {
  await clearEmulator();
  base = await baseData();
  await col(COLLECTIONS.shifts)
    .doc(base.morning.id)
    .update({ startTime: "08:00", endTime: "16:00" });
  status = Object.fromEntries((await listAttendanceStatuses()).map((s) => [s.name, s.id]));
  await createTeamDoc("renault", "רנו", ["tm-user"]);
  await createTeamDoc("nissan", "ניסאן");
  await createAgentDoc("a1", "renault");
  await createAgentDoc("a2", "renault");
  await createAgentDoc("b1", "nissan");
  const admin = actors.admin();
  for (const [agentId, locationId] of [
    ["a1", base.office.id],
    ["a2", base.home.id],
    ["b1", base.office.id],
  ]) {
    await setDayEntry(admin, agentId, DAY, { kind: "shift", shiftId: base.morning.id, locationId });
  }
});

describe("attendance", () => {
  it("lets the shift lead mark every team against the draft schedule", async () => {
    const lead = shiftLead();
    const day = await getAttendanceDay(lead, DAY);
    expect(day.rows.map((r) => r.agentId).sort()).toEqual(["a1", "a2", "b1"]);
    expect(day.teams.every((t) => !t.published && t.canManage)).toBe(true);
    expect(day.statuses.map((s) => s.name)).toEqual([
      "הגיע",
      "איחר",
      "לא הגיע",
      "יצא מוקדם",
      "חולה",
    ]);

    // Came: the planned location is kept
    await recordAttendance(lead, { date: DAY, agentId: "a1", statusId: status["הגיע"] });
    // Late, and working from the office instead of home
    await recordAttendance(lead, {
      date: DAY,
      agentId: "a2",
      statusId: status["איחר"],
      time: "08:40",
      locationId: base.office.id,
    });
    await recordAttendance(lead, { date: DAY, agentId: "b1", statusId: status["חולה"] });

    const a1 = await col(COLLECTIONS.attendance).doc(attendanceId("a1", DAY)).get();
    expect(a1.get("locationId")).toBe(base.office.id);
    const a2 = await col(COLLECTIONS.attendance).doc(attendanceId("a2", DAY)).get();
    expect(a2.get("minutesOff")).toBe(40);
    expect(a2.get("plannedLocationId")).toBe(base.home.id);
    expect(a2.get("locationId")).toBe(base.office.id);
    const b1 = await col(COLLECTIONS.attendance).doc(attendanceId("b1", DAY)).get();
    expect(b1.get("locationId")).toBeNull();

    const audit = await col(COLLECTIONS.auditLogs).where("entityType", "==", "attendance").get();
    expect(audit.size).toBe(3);

    // The schedule itself is untouched
    const plan = await col(COLLECTIONS.assignments).doc(`a2_${DAY}`).get();
    expect(plan.get("locationId")).toBe(base.home.id);

    await clearAttendance(lead, DAY, "a1");
    const after = await getAttendanceDay(lead, DAY);
    expect(after.rows.find((r) => r.agentId === "a1")?.record).toBeNull();
  });

  it("validates times, unscheduled agents and future dates", async () => {
    const lead = shiftLead();
    await expect(
      recordAttendance(lead, { date: DAY, agentId: "a2", statusId: status["איחר"] }),
    ).rejects.toThrow("שעת הגעה");
    await createAgentDoc("a3", "renault");
    await expect(
      recordAttendance(lead, { date: DAY, agentId: "a3", statusId: status["הגיע"] }),
    ).rejects.toThrow("משמרת");
    await recordAttendance(lead, {
      date: DAY,
      agentId: "a3",
      statusId: status["הגיע"],
      shiftId: base.morning.id,
      locationId: base.office.id,
    });
    const day = await getAttendanceDay(lead, DAY);
    expect(day.rows.find((r) => r.agentId === "a3")?.unscheduled).toBe(true);
    expect(day.addable.some((a) => a.agentId === "a3")).toBe(false);
    await expect(
      recordAttendance(lead, {
        date: addDays(todayIso(), 1),
        agentId: "a1",
        statusId: status["הגיע"],
      }),
    ).rejects.toThrow("עתידי");
  });

  it("limits team managers to viewing their own teams", async () => {
    const tm = actors.teamManager(["renault"]);
    const day = await getAttendanceDay(tm, DAY);
    expect(day.rows.map((r) => r.agentId).sort()).toEqual(["a1", "a2"]);
    expect(day.rows.every((r) => !r.canManage)).toBe(true);
    await expect(
      recordAttendance(tm, { date: DAY, agentId: "a1", statusId: status["הגיע"] }),
    ).rejects.toThrow();
  });

  it("gives existing system roles the new permissions once, keeping the admin's edits", async () => {
    const ref = col(COLLECTIONS.roles).doc(SYSTEM_ROLE_IDS.centerManager);
    // A role from before attendance existed, from which the admin removed "audit.view"
    await ref.update({ permissions: { "schedule.view": "all" }, seededKeys: FieldValue.delete() });
    await ensureDefaultRoles();
    let role = (await ref.get()).data()!;
    expect(role.permissions).toEqual({
      "schedule.view": "all",
      "attendance.view": "all",
      "attendance.manage": "all",
    });
    // Removing it again sticks
    await ref.update({ permissions: { "schedule.view": "all" } });
    await ensureDefaultRoles();
    role = (await ref.get()).data()!;
    expect(role.permissions).toEqual({ "schedule.view": "all" });
    expect((await col(COLLECTIONS.roles).doc(SYSTEM_ROLE_IDS.shiftLead).get()).exists).toBe(true);
  });
});
