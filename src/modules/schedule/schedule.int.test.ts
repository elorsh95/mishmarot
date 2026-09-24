import { beforeEach, describe, expect, it } from "vitest";
import { col, COLLECTIONS, fromDoc } from "@/lib/firebase/collections";
import { updateAgent, getAgent } from "@/modules/agents/service";
import { decideApproval, listApprovals } from "@/modules/approvals/service";
import { actors, baseData, clearEmulator, createAgentDoc, createTeamDoc } from "@/test/helpers";
import { applyChanges } from "./engine";
import { clearSpecialDay, setSpecialDay } from "@/modules/calendar/service";
import {
  copyPreviousWeek,
  fillFromDefaults,
  getWeekView,
  setDayEntry,
  setWeekStatus,
} from "./service";
import { assignmentId, type Assignment } from "./types";

let base: Awaited<ReturnType<typeof baseData>>;

async function entry(agentId: string, date: string) {
  const snap = await col(COLLECTIONS.assignments).doc(assignmentId(agentId, date)).get();
  return snap.exists ? fromDoc<Assignment>(snap) : null;
}

async function approvalsFor(agentId: string) {
  const snap = await col(COLLECTIONS.approvals).where("agentId", "==", agentId).get();
  return snap.docs.map(
    (d) => ({ id: d.id, ...d.data() }) as { id: string; status: string; date: string },
  );
}

beforeEach(async () => {
  await clearEmulator();
  base = await baseData();
  await createTeamDoc("renault", "רנו", ["tm-user"]);
  await createTeamDoc("nissan", "ניסאן", ["tm-other"]);
  await createAgentDoc("a1", "renault");
  await createAgentDoc("a2", "nissan");
});

const home = () => ({ kind: "shift" as const, shiftId: base.morning.id, locationId: base.home.id });
const office = () => ({
  kind: "shift" as const,
  shiftId: base.morning.id,
  locationId: base.office.id,
});

describe("monthly home quota", () => {
  it("third home day in a month needs approval", async () => {
    const tm = actors.teamManager(["renault"]);
    await setDayEntry(tm, "a1", "2030-03-03", home());
    await setDayEntry(tm, "a1", "2030-03-04", home());
    const result = await setDayEntry(tm, "a1", "2030-03-05", home());

    expect((await entry("a1", "2030-03-03"))?.quotaStatus).toBe("within_quota");
    expect((await entry("a1", "2030-03-04"))?.quotaStatus).toBe("within_quota");
    const third = await entry("a1", "2030-03-05");
    expect(third?.quotaStatus).toBe("pending");
    expect(result.pendingApprovalIds).toHaveLength(1);
    expect(third?.approvalId).toBe(result.pendingApprovalIds[0]);

    const list = await listApprovals(actors.centerManager(), { status: "pending" });
    expect(list).toHaveLength(1);
    expect(list[0].position).toBe(3);
    expect(list[0].monthQuotaDates).toEqual(["2030-03-03", "2030-03-04", "2030-03-05"]);
  });

  it("office days do not count and the count resets each calendar month", async () => {
    const tm = actors.teamManager(["renault"]);
    await applyChanges(
      tm,
      [
        { agentId: "a1", date: "2030-02-26", entry: home() },
        { agentId: "a1", date: "2030-02-27", entry: home() },
        { agentId: "a1", date: "2030-03-03", entry: office() },
        { agentId: "a1", date: "2030-03-04", entry: home() },
        { agentId: "a1", date: "2030-03-05", entry: home() },
      ],
      { mode: "strict" },
    );
    expect((await entry("a1", "2030-03-04"))?.quotaStatus).toBe("within_quota");
    expect((await entry("a1", "2030-03-05"))?.quotaStatus).toBe("within_quota");
    expect((await entry("a1", "2030-03-03"))?.quotaStatus).toBe("none");
  });

  it("removing an earlier home day releases the pending one", async () => {
    const tm = actors.teamManager(["renault"]);
    for (const d of ["2030-03-03", "2030-03-04", "2030-03-05"]) {
      await setDayEntry(tm, "a1", d, home());
    }
    await setDayEntry(tm, "a1", "2030-03-03", null);
    expect(await entry("a1", "2030-03-03")).toBeNull();
    expect((await entry("a1", "2030-03-05"))?.quotaStatus).toBe("within_quota");
    const approvals = await approvalsFor("a1");
    expect(approvals.map((a) => a.status)).toEqual(["cancelled"]);
  });

  it("changing the pending day to office cancels the request", async () => {
    const tm = actors.teamManager(["renault"]);
    for (const d of ["2030-03-03", "2030-03-04", "2030-03-05"]) {
      await setDayEntry(tm, "a1", d, home());
    }
    await setDayEntry(tm, "a1", "2030-03-05", office());
    expect((await entry("a1", "2030-03-05"))?.quotaStatus).toBe("none");
    expect((await approvalsFor("a1"))[0].status).toBe("cancelled");
  });

  it("center manager approves or rejects; rejected days stop counting", async () => {
    const tm = actors.teamManager(["renault"]);
    for (const d of ["2030-03-03", "2030-03-04", "2030-03-05", "2030-03-06"]) {
      await setDayEntry(tm, "a1", d, home());
    }
    const pending = await listApprovals(actors.centerManager(), { status: "pending" });
    expect(pending.map((p) => p.date)).toEqual(["2030-03-05", "2030-03-06"]);

    await expect(
      decideApproval(tm, { approvalId: pending[0].id, decision: "approved" }),
    ).rejects.toThrow();
    await expect(
      decideApproval(actors.centerManager(), { approvalId: pending[0].id, decision: "rejected" }),
    ).rejects.toThrow(/הערה/);

    await decideApproval(actors.centerManager(), {
      approvalId: pending[0].id,
      decision: "rejected",
      note: "לא מאושר החודש",
    });
    await decideApproval(actors.centerManager(), {
      approvalId: pending[1].id,
      decision: "approved",
    });
    expect((await entry("a1", "2030-03-05"))?.quotaStatus).toBe("rejected");
    expect((await entry("a1", "2030-03-06"))?.quotaStatus).toBe("approved");

    // A new day after the rejected one: rejected doesn't count, approved does -> 4th counted -> pending
    await setDayEntry(tm, "a1", "2030-03-10", home());
    expect((await entry("a1", "2030-03-10"))?.quotaStatus).toBe("pending");
  });

  it("per-agent quota is respected and changing it recomputes", async () => {
    const tm = actors.teamManager(["renault"]);
    for (const d of ["2030-03-03", "2030-03-04", "2030-03-05"]) {
      await setDayEntry(tm, "a1", d, home());
    }
    expect((await entry("a1", "2030-03-05"))?.quotaStatus).toBe("pending");

    // Team managers cannot change the quota (ignored silently)
    const agent = (await getAgent("a1"))!;
    await updateAgent(tm, "a1", { ...agent, monthlyQuota: 5 });
    expect((await getAgent("a1"))?.monthlyQuota).toBeNull();

    // Center manager can, and the month is recomputed: the pending day is released
    await updateAgent(actors.centerManager(), "a1", { ...agent, monthlyQuota: 3 });
    expect((await getAgent("a1"))?.monthlyQuota).toBe(3);
    expect((await entry("a1", "2030-03-05"))?.quotaStatus).toBe("within_quota");
    expect((await approvalsFor("a1"))[0].status).toBe("cancelled");

    // Lowering it back re-opens a request
    await updateAgent(actors.centerManager(), "a1", { ...agent, monthlyQuota: 1 });
    expect((await entry("a1", "2030-03-04"))?.quotaStatus).toBe("pending");
    expect((await entry("a1", "2030-03-05"))?.quotaStatus).toBe("pending");
  });
});

describe("permissions and locks", () => {
  it("team manager edits only their own team", async () => {
    const tm = actors.teamManager(["renault"]);
    await expect(setDayEntry(tm, "a2", "2030-03-03", office())).rejects.toThrow(/הרשאה/);
    await setDayEntry(actors.centerManager(), "a2", "2030-03-03", office());
    expect(await entry("a2", "2030-03-03")).not.toBeNull();
  });

  it("past weeks are locked for team managers but not for the center manager", async () => {
    const tm = actors.teamManager(["renault"]);
    await expect(setDayEntry(tm, "a1", "2020-03-03", office())).rejects.toThrow(/נעול/);
    await setDayEntry(actors.centerManager(), "a1", "2020-03-03", office());
    expect(await entry("a1", "2020-03-03")).not.toBeNull();
  });

  it("published weeks are locked for team managers until returned to draft", async () => {
    const tm = actors.teamManager(["renault"]);
    await setWeekStatus(tm, "renault", "2030-03-03", "published");
    await expect(setDayEntry(tm, "a1", "2030-03-04", office())).rejects.toThrow(/פורסם/);
    await setWeekStatus(tm, "renault", "2030-03-03", "draft");
    await setDayEntry(tm, "a1", "2030-03-04", office());
  });

  it("rejects shifts on days they don't run", async () => {
    const tm = actors.teamManager(["renault"]);
    // Friday 2030-03-08: evening shift runs Sun–Thu only
    await expect(
      setDayEntry(tm, "a1", "2030-03-08", {
        kind: "shift",
        shiftId: base.evening.id,
        locationId: base.office.id,
      }),
    ).rejects.toThrow(/לא מתקיימת/);
  });
});

describe("week operations", () => {
  it("copies the previous week's shifts, not absences", async () => {
    const tm = actors.teamManager(["renault"]);
    await setDayEntry(tm, "a1", "2030-03-03", office());
    await setDayEntry(tm, "a1", "2030-03-04", { kind: "absence", absenceTypeId: base.vacation.id });
    const result = await copyPreviousWeek(tm, "renault", "2030-03-10");
    expect(result.changed).toBe(1);
    expect((await entry("a1", "2030-03-10"))?.locationId).toBe(base.office.id);
    expect(await entry("a1", "2030-03-11")).toBeNull();

    const view = await getWeekView(tm, "renault", "2030-03-10");
    expect(view.days).toHaveLength(6); // Sunday–Friday
    expect(Object.keys(view.assignments)).toHaveLength(1);
  });
});

describe("transfers", () => {
  it("destination manager requests, source manager approves, future entries move", async () => {
    const { requestTransfer, decideTransfer, listTransfers } =
      await import("@/modules/transfers/service");
    const renaultTm = actors.teamManager(["renault"]);
    const nissanTm = actors.teamManager(["nissan"], "tm-other");
    await setDayEntry(actors.centerManager(), "a2", "2030-03-03", office());

    // Nissan's manager cannot request into a team they don't manage
    await expect(
      requestTransfer(nissanTm, { agentId: "a1", toTeamId: "renault" }),
    ).rejects.toThrow();

    const id = await requestTransfer(renaultTm, { agentId: "a2", toTeamId: "renault", note: "" });
    expect((await listTransfers(nissanTm)).incoming.map((t) => t.id)).toEqual([id]);
    expect((await listTransfers(renaultTm)).outgoing.map((t) => t.id)).toEqual([id]);

    // Only the source team's manager may approve
    await expect(
      decideTransfer(renaultTm, { transferId: id, decision: "approved" }),
    ).rejects.toThrow();
    await decideTransfer(nissanTm, { transferId: id, decision: "approved" });

    expect((await getAgent("a2"))?.teamId).toBe("renault");
    expect((await entry("a2", "2030-03-03"))?.teamId).toBe("renault");
  });
});

describe("holidays", () => {
  // Pesach 2030: Wednesday 17.4 is Erev Pesach, Thursday 18.4 is the holiday.
  const eve = "2030-04-17";
  const holiday = "2030-04-18";
  const evening = () => ({
    kind: "shift" as const,
    shiftId: base.evening.id,
    locationId: base.office.id,
  });

  it("nothing can be scheduled on a holiday, and only Friday shifts on its eve", async () => {
    const tm = actors.teamManager(["renault"]);
    await expect(setDayEntry(tm, "a1", holiday, office())).rejects.toThrow(/סגור/);
    await expect(
      setDayEntry(tm, "a1", holiday, { kind: "absence", absenceTypeId: base.vacation.id }),
    ).rejects.toThrow(/סגור/);
    await expect(setDayEntry(tm, "a1", eve, evening())).rejects.toThrow(/ערב חג/);
    await setDayEntry(tm, "a1", eve, office());
    expect((await entry("a1", eve))?.shiftId).toBe(base.morning.id);

    const view = await getWeekView(tm, "renault", "2030-04-14");
    expect(view.dayInfo[eve]).toMatchObject({ kind: "eve", name: "ערב פסח" });
    expect(view.dayInfo[holiday]).toMatchObject({ kind: "closed", name: "פסח א׳" });
    expect(view.dayInfo["2030-04-15"]).toMatchObject({ kind: "regular", name: null });
  });

  it("a special day overrides the calendar and can be reset", async () => {
    const tm = actors.teamManager(["renault"]);
    await expect(setSpecialDay(tm, { date: holiday, kind: "regular" })).rejects.toThrow(/הרשאה/);
    await setSpecialDay(actors.centerManager(), { date: holiday, kind: "regular" });
    await setDayEntry(tm, "a1", holiday, evening());

    await setSpecialDay(actors.centerManager(), {
      date: "2030-04-15",
      kind: "closed",
      name: "יום גיבוש",
    });
    const view = await getWeekView(tm, "renault", "2030-04-14");
    expect(view.dayInfo["2030-04-15"]).toMatchObject({
      kind: "closed",
      name: "יום גיבוש",
      source: "custom",
    });
    expect(view.dayInfo[holiday]).toMatchObject({
      kind: "regular",
      name: "פסח א׳",
      source: "custom",
    });

    await clearSpecialDay(actors.centerManager(), holiday);
    await expect(setDayEntry(tm, "a1", "2030-04-18", office())).rejects.toThrow(/סגור/);
    const audit = await col(COLLECTIONS.auditLogs).where("entityType", "==", "calendar").get();
    expect(audit.size).toBe(3);
  });

  it("filling from defaults and copying a week skip holidays quietly", async () => {
    const tm = actors.teamManager(["renault"]);
    await col(COLLECTIONS.agents)
      .doc("a1")
      .update({
        defaultShiftId: base.evening.id,
        defaultLocationId: base.office.id,
        defaultDays: [0, 1, 2, 3, 4],
      });
    const filled = await fillFromDefaults(tm, "renault", "2030-04-14");
    expect(filled.skipped).toEqual([]);
    const view = await getWeekView(tm, "renault", "2030-04-14");
    expect(
      Object.values(view.assignments)
        .map((a) => a.date)
        .sort(),
    ).toEqual(["2030-04-14", "2030-04-15", "2030-04-16"]);

    // a3 worked evenings on Wednesday and Thursday last week. Copying into the Pesach week
    // leaves the eve (no evening shift) and the holiday empty, without reporting errors.
    await createAgentDoc("a3", "renault");
    for (const d of ["2030-04-10", "2030-04-11"]) await setDayEntry(tm, "a3", d, evening());
    const copied = await copyPreviousWeek(tm, "renault", "2030-04-14");
    expect(copied.skipped).toEqual([]);
    expect(await entry("a3", eve)).toBeNull();
    expect(await entry("a3", holiday)).toBeNull();
  });
});
