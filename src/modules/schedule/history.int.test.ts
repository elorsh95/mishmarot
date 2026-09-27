import { beforeEach, describe, expect, it } from "vitest";
import { actors, baseData, clearEmulator, createAgentDoc, createTeamDoc } from "@/test/helpers";
import { cellHistory } from "./history";
import { setDayEntry } from "./service";

let base: Awaited<ReturnType<typeof baseData>>;

beforeEach(async () => {
  await clearEmulator();
  base = await baseData();
  await createTeamDoc("renault", "רנו", ["tm-user"]);
  await createAgentDoc("a1", "renault");
});

describe("cell history", () => {
  it("lists the cell's changes, newest first, to those who view the team", async () => {
    const tm = actors.teamManager(["renault"]);
    await setDayEntry(tm, "a1", "2030-03-03", {
      kind: "shift",
      shiftId: base.morning.id,
      locationId: base.office.id,
    });
    await setDayEntry(tm, "a1", "2030-03-03", {
      kind: "absence",
      absenceTypeId: base.vacation.id,
    });
    await setDayEntry(tm, "a1", "2030-03-03", null);
    await setDayEntry(tm, "a1", "2030-03-04", {
      kind: "absence",
      absenceTypeId: base.vacation.id,
    }); // another day

    const items = await cellHistory(tm, "a1", "2030-03-03");
    expect(items.map((i) => i.summary.split(" ")[0])).toEqual(["הוסר", "עודכן", "נוסף"]);
    expect(items[0].actorName).toBe("tm-user");

    await expect(cellHistory(actors.teamManager(["other"]), "a1", "2030-03-03")).rejects.toThrow();
  });
});
