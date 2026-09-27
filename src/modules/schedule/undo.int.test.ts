import { beforeEach, describe, expect, it } from "vitest";
import { col, COLLECTIONS } from "@/lib/firebase/collections";
import { actors, baseData, clearEmulator, createAgentDoc, createTeamDoc } from "@/test/helpers";
import { setDayEntry, setEntries } from "./service";
import { assignmentId } from "./types";
import { saveUndo, undoBatch } from "./undo";

let base: Awaited<ReturnType<typeof baseData>>;

beforeEach(async () => {
  await clearEmulator();
  base = await baseData();
  await createTeamDoc("renault", "רנו", ["tm-user"]);
  await createAgentDoc("a1", "renault");
  await createAgentDoc("a2", "renault");
});

const office = () => ({
  kind: "shift" as const,
  shiftId: base.morning.id,
  locationId: base.office.id,
});
const entry = async (agentId: string, date: string) =>
  (await col(COLLECTIONS.assignments).doc(assignmentId(agentId, date)).get()).data();

describe("undoing a bulk action", () => {
  it("restores the cells it changed, but not ones changed since", async () => {
    const tm = actors.teamManager(["renault"]);
    await setDayEntry(tm, "a1", "2030-03-03", { kind: "absence", absenceTypeId: base.vacation.id });
    const result = await setEntries(
      tm,
      [
        { agentId: "a1", date: "2030-03-03" },
        { agentId: "a1", date: "2030-03-04" },
        { agentId: "a2", date: "2030-03-04" },
      ],
      office(),
    );
    expect(result.changes).toHaveLength(3);
    const token = await saveUndo(tm, result);
    expect(token).toBeTruthy();

    // Someone edits one of the cells before the undo
    await setDayEntry(tm, "a2", "2030-03-04", null);

    const undone = await undoBatch(tm, token!);
    expect(undone.changed).toBe(2);
    expect(undone.skipped).toHaveLength(1);
    expect((await entry("a1", "2030-03-03"))?.kind).toBe("absence");
    expect(await entry("a1", "2030-03-04")).toBeUndefined();

    // Only once, and only by its author
    await expect(undoBatch(tm, token!)).rejects.toThrow();
  });

  it("keeps only the user's last bulk action", async () => {
    const tm = actors.teamManager(["renault"]);
    const first = await saveUndo(
      tm,
      await setEntries(tm, [{ agentId: "a1", date: "2030-03-05" }], office()),
    );
    const second = await saveUndo(
      tm,
      await setEntries(tm, [{ agentId: "a2", date: "2030-03-05" }], office()),
    );
    await expect(undoBatch(tm, first!)).rejects.toThrow("האחרונה");
    await expect(undoBatch(actors.admin(), second!)).rejects.toThrow();
    expect((await undoBatch(tm, second!)).changed).toBe(1);
  });
});
