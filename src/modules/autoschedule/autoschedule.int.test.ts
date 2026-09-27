import { beforeEach, describe, expect, it } from "vitest";
import { col, COLLECTIONS } from "@/lib/firebase/collections";
import { setDayEntry } from "@/modules/schedule/service";
import { assignmentId } from "@/modules/schedule/types";
import { actors, baseData, clearEmulator, createAgentDoc, createTeamDoc } from "@/test/helpers";
import { applyProposal, proposeWeek } from "./service";

let base: Awaited<ReturnType<typeof baseData>>;

beforeEach(async () => {
  await clearEmulator();
  base = await baseData();
  await createTeamDoc("renault", "רנו", ["tm-user"]);
  await col(COLLECTIONS.teams).doc("renault").update({ minMorning: 1, minEvening: 1 });
  for (const id of ["a1", "a2", "a3"]) {
    await createAgentDoc(id, "renault", {
      defaultShiftId: base.morning.id,
      defaultLocationId: base.office.id,
    });
  }
});

describe("auto-schedule service", () => {
  it("proposes a fair week from history and applies it, leaving edited cells alone", async () => {
    const tm = actors.teamManager(["renault"]);
    // History: a1 worked two evenings last week, a2 one, a3 none
    await setDayEntry(tm, "a1", "2030-02-24", {
      kind: "shift",
      shiftId: base.evening.id,
      locationId: base.office.id,
    });
    await setDayEntry(tm, "a1", "2030-02-25", {
      kind: "shift",
      shiftId: base.evening.id,
      locationId: base.office.id,
    });
    await setDayEntry(tm, "a2", "2030-02-26", {
      kind: "shift",
      shiftId: base.evening.id,
      locationId: base.office.id,
    });

    const proposal = await proposeWeek(tm, "renault", "2030-03-05", { fridayRotation: false });
    expect(proposal.weekStart).toBe("2030-03-03");
    const sunday = proposal.entries.filter((e) => e.date === "2030-03-03");
    expect(sunday).toHaveLength(3);
    // a3 had no evenings, so a3 takes Sunday evening
    expect(sunday.find((e) => e.shiftId === base.evening.id)?.agentId).toBe("a3");
    expect(proposal.fairness.find((f) => f.agentId === "a1")?.pastEvenings).toBe(2);

    // Someone fills a cell before the proposal is applied
    await setDayEntry(tm, "a1", "2030-03-03", { kind: "absence", absenceTypeId: base.vacation.id });
    const result = await applyProposal(tm, "renault", "2030-03-03", proposal.entries);
    expect(result.changed).toBe(proposal.entries.length - 1);
    const kept = await col(COLLECTIONS.assignments).doc(assignmentId("a1", "2030-03-03")).get();
    expect(kept.get("kind")).toBe("absence");

    await expect(
      proposeWeek(actors.teamManager(["other"]), "renault", "2030-03-03", {
        fridayRotation: false,
      }),
    ).rejects.toThrow();
  });
});
