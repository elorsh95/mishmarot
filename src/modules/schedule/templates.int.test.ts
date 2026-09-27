import { beforeEach, describe, expect, it } from "vitest";
import { col, COLLECTIONS } from "@/lib/firebase/collections";
import { actors, baseData, clearEmulator, createAgentDoc, createTeamDoc } from "@/test/helpers";
import { setDayEntry } from "./service";
import { applyTemplate, deleteTemplate, listTemplates, saveTemplate } from "./templates";
import { assignmentId } from "./types";

let base: Awaited<ReturnType<typeof baseData>>;

beforeEach(async () => {
  await clearEmulator();
  base = await baseData();
  await createTeamDoc("renault", "רנו", ["tm-user"]);
  await createTeamDoc("nissan", "ניסאן");
  await createAgentDoc("a1", "renault");
  await createAgentDoc("a2", "renault");
});

const shift = () => ({
  kind: "shift" as const,
  shiftId: base.morning.id,
  locationId: base.office.id,
});

describe("week templates", () => {
  it("saves a week and fills another week's empty days from it", async () => {
    const tm = actors.teamManager(["renault"]);
    // Week of 3.3.2030: a1 Sunday + Monday, a2 Sunday, plus an absence (not saved)
    await setDayEntry(tm, "a1", "2030-03-03", shift());
    await setDayEntry(tm, "a1", "2030-03-04", shift());
    await setDayEntry(tm, "a2", "2030-03-03", shift());
    await setDayEntry(tm, "a2", "2030-03-05", { kind: "absence", absenceTypeId: base.vacation.id });
    const id = await saveTemplate(tm, "renault", "2030-03-03", "שבוע רגיל");
    expect(await listTemplates(tm, "renault")).toMatchObject([{ name: "שבוע רגיל", size: 3 }]);

    // Next week: a1 already has Sunday, a2 has left the team
    await setDayEntry(tm, "a1", "2030-03-10", {
      kind: "absence",
      absenceTypeId: base.vacation.id,
    });
    await col(COLLECTIONS.agents).doc("a2").update({ teamId: "nissan" });
    const result = await applyTemplate(tm, id, "2030-03-12");
    expect(result.changed).toBe(1);
    expect(result.changes[0]).toMatchObject({ agentId: "a1", date: "2030-03-11" });
    const sunday = await col(COLLECTIONS.assignments).doc(assignmentId("a1", "2030-03-10")).get();
    expect(sunday.get("kind")).toBe("absence");

    // Saving under the same name replaces it; other teams' managers can't use it
    await saveTemplate(tm, "renault", "2030-03-10", "שבוע רגיל");
    expect(await listTemplates(tm, "renault")).toHaveLength(1);
    await expect(applyTemplate(actors.teamManager(["nissan"]), id, "2030-03-17")).rejects.toThrow();

    await deleteTemplate(tm, id);
    expect(await listTemplates(tm, "renault")).toEqual([]);
  });

  it("refuses to save a week without shifts", async () => {
    await expect(
      saveTemplate(actors.teamManager(["renault"]), "renault", "2030-03-03", "ריק"),
    ).rejects.toThrow("אין שיבוצי משמרת");
  });
});
