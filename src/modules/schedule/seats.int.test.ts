import { beforeEach, describe, expect, it } from "vitest";
import { actors, baseData, clearEmulator, createAgentDoc, createTeamDoc } from "@/test/helpers";
import { getWeekSeatUsage, setDayEntry } from "./service";

let base: Awaited<ReturnType<typeof baseData>>;

beforeEach(async () => {
  await clearEmulator();
  base = await baseData();
  await createTeamDoc("renault", "רנו", ["tm-user"]);
  await createTeamDoc("nissan", "ניסאן");
  await createAgentDoc("a1", "renault");
  await createAgentDoc("b1", "nissan");
  await createAgentDoc("b2", "nissan");
});

describe("seat usage", () => {
  it("counts the whole center's seats, also for a team manager of one team", async () => {
    const admin = actors.admin();
    const day = "2030-03-04";
    await setDayEntry(admin, "a1", day, {
      kind: "shift",
      shiftId: base.morning.id,
      locationId: base.office.id,
    });
    await setDayEntry(admin, "b1", day, {
      kind: "shift",
      shiftId: base.morning.id,
      locationId: base.office.id,
    });
    await setDayEntry(admin, "b2", day, {
      kind: "shift",
      shiftId: base.evening.id,
      locationId: base.home.id,
    });

    const usage = await getWeekSeatUsage(actors.teamManager(["renault"]), day);
    expect(usage[day].morning[base.office.id]).toBe(2);
    expect(usage[day].evening[base.home.id]).toBe(1);
  });
});
