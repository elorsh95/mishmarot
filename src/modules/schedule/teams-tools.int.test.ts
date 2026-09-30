import { beforeEach, describe, expect, it } from "vitest";
import { col, COLLECTIONS } from "@/lib/firebase/collections";
import { actors, baseData, clearEmulator, createAgentDoc, createTeamDoc } from "@/test/helpers";
import { saveUndo, undoBatch } from "./undo";
import { setDayEntry, setEntries, setWeekStatusForTeams, weekToolForTeams } from "./service";
import { assignmentId, weekId } from "./types";

let base: Awaited<ReturnType<typeof baseData>>;
// 2030-03-03 is a Sunday.
const WEEK = "2030-03-03";

beforeEach(async () => {
  await clearEmulator();
  base = await baseData();
  await createTeamDoc("renault", "רנו", ["tm-user"]);
  await createTeamDoc("nissan", "ניסאן");
  await createAgentDoc("a1", "renault");
  await createAgentDoc("a2", "nissan");
});

const office = () => ({
  kind: "shift" as const,
  shiftId: base.morning.id,
  locationId: base.office.id,
});
const exists = async (agentId: string, date: string) =>
  (await col(COLLECTIONS.assignments).doc(assignmentId(agentId, date)).get()).exists;

describe("week tools on several teams", () => {
  it("copies the previous week for every team, undoable together", async () => {
    const admin = actors.admin();
    await setDayEntry(admin, "a1", "2030-02-25", office());
    await setDayEntry(admin, "a2", "2030-02-26", office());
    const result = await weekToolForTeams(admin, ["renault", "nissan"], WEEK, "copyPrevious");
    expect(result.changed).toBe(2);
    expect(await exists("a1", "2030-03-04")).toBe(true);
    expect(await exists("a2", "2030-03-05")).toBe(true);

    const token = await saveUndo(admin, result);
    await undoBatch(admin, token!);
    expect(await exists("a1", "2030-03-04")).toBe(false);
    expect(await exists("a2", "2030-03-05")).toBe(false);
  });

  it("skips the teams the actor can't edit", async () => {
    const admin = actors.admin();
    await setEntries(
      admin,
      [
        { agentId: "a1", date: "2030-03-04" },
        { agentId: "a2", date: "2030-03-04" },
      ],
      office(),
    );
    const tm = actors.teamManager(["renault"]);
    const result = await weekToolForTeams(tm, ["renault", "nissan"], WEEK, "clear");
    expect(result.changed).toBe(1);
    expect(await exists("a1", "2030-03-04")).toBe(false);
    expect(await exists("a2", "2030-03-04")).toBe(true);
  });

  it("publishes several teams, skipping ones already published or not allowed", async () => {
    const tm = actors.teamManager(["renault"]);
    expect(await setWeekStatusForTeams(tm, ["renault", "nissan"], WEEK, "published")).toBe(1);
    const status = async (team: string) =>
      (await col(COLLECTIONS.weeks).doc(weekId(team, WEEK)).get()).get("status") ?? "draft";
    expect(await status("renault")).toBe("published");
    expect(await status("nissan")).toBe("draft");

    const admin = actors.admin();
    expect(await setWeekStatusForTeams(admin, ["renault", "nissan"], WEEK, "published")).toBe(1);
    expect(await status("nissan")).toBe("published");
    expect(await setWeekStatusForTeams(admin, ["renault", "nissan"], WEEK, "draft")).toBe(2);
  });
});
