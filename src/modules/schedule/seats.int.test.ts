import { beforeEach, describe, expect, it } from "vitest";
import { actors, baseData, clearEmulator, createAgentDoc, createTeamDoc } from "@/test/helpers";
import { col, COLLECTIONS } from "@/lib/firebase/collections";
import { getWeekSeats, getWeekSeatUsage, setDayEntry } from "./service";

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

  it("splits the week's seats by activity", async () => {
    const admin = actors.admin();
    const day = "2030-03-04";
    await col(COLLECTIONS.activities).doc("new").set({ name: "רכב חדש", sortOrder: 1, seats: 18 });
    await col(COLLECTIONS.teams).doc("renault").update({ activityId: "new" });
    const office = { kind: "shift" as const, shiftId: base.morning.id, locationId: base.office.id };
    await setDayEntry(admin, "a1", day, office);
    await setDayEntry(admin, "b1", day, office);

    const seats = await getWeekSeats(actors.teamManager(["renault"]), day);
    expect(seats.center[day].morning[base.office.id]).toBe(2);
    expect(seats.byActivity.new[day].morning[base.office.id]).toBe(1);
    expect(Object.keys(seats.byActivity)).toEqual(["new"]);
  });
});
