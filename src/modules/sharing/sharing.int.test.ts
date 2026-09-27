import { beforeEach, describe, expect, it } from "vitest";
import { col, COLLECTIONS } from "@/lib/firebase/collections";
import { setDayEntry, setWeekStatus } from "@/modules/schedule/service";
import { actors, baseData, clearEmulator, createAgentDoc, createTeamDoc } from "@/test/helpers";
import { createShareLink, getShareLink, getSharedWeek, revokeShareLink } from "./service";

let base: Awaited<ReturnType<typeof baseData>>;
const week = "2030-03-03";

beforeEach(async () => {
  await clearEmulator();
  base = await baseData();
  await createTeamDoc("renault", "רנו", ["tm-user"]);
  await createTeamDoc("nissan", "ניסאן");
  await createAgentDoc("a1", "renault", { firstName: "דנה", lastName: "לוי" });
  await createAgentDoc("a2", "nissan");
  await setDayEntry(actors.admin(), "a1", "2030-03-03", {
    kind: "shift",
    shiftId: base.morning.id,
    locationId: base.home.id,
    note: "הערה פנימית",
  });
});

describe("share links", () => {
  it("shows only published weeks, without internal details", async () => {
    const tm = actors.teamManager(["renault"]);
    const link = await createShareLink(tm, "renault");
    expect(link.token.length).toBeGreaterThanOrEqual(40);

    const draft = await getSharedWeek(link.token, week);
    expect(draft).toMatchObject({ teamName: "רנו", published: false, agents: [], cells: {} });

    await setWeekStatus(tm, "renault", week, "published");
    const shared = await getSharedWeek(link.token, week);
    expect(shared?.published).toBe(true);
    expect(shared?.agents).toEqual([{ id: "a1", name: "דנה לוי" }]);
    expect(shared?.cells["a1_2030-03-03"]).toMatchObject({
      text: base.morning.name,
      sub: base.home.name,
      absence: false,
    });
    // No notes or employee numbers leave the system
    expect(JSON.stringify(shared)).not.toContain("הערה פנימית");
    expect(JSON.stringify(shared)).not.toContain("employeeNumber");
  });

  it("replacing or revoking a link stops the old one; bad tokens get nothing", async () => {
    const tm = actors.teamManager(["renault"]);
    const first = await createShareLink(tm, "renault");
    const second = await createShareLink(tm, "renault");
    expect(await getSharedWeek(first.token, week)).toBeNull();
    expect(await getSharedWeek(second.token, week)).not.toBeNull();
    expect((await getShareLink(tm, "renault"))?.token).toBe(second.token);

    await revokeShareLink(tm, "renault");
    expect(await getSharedWeek(second.token, week)).toBeNull();
    expect(await getShareLink(tm, "renault")).toBeNull();

    expect(await getSharedWeek("nope", week)).toBeNull();
    expect(await getSharedWeek("../../etc", week)).toBeNull();
    const audit = await col(COLLECTIONS.auditLogs).where("entityType", "==", "shareLink").get();
    expect(audit.size).toBe(3);
  });

  it("only schedule publishers of the team can manage its link", async () => {
    const tm = actors.teamManager(["renault"]);
    await expect(createShareLink(tm, "nissan")).rejects.toThrow(/הרשאה/);
    await expect(getShareLink(tm, "nissan")).rejects.toThrow(/הרשאה/);
    // A renault link never shows nissan's agents
    const link = await createShareLink(tm, "renault");
    await setWeekStatus(actors.admin(), "renault", week, "published");
    const shared = await getSharedWeek(link.token, week);
    expect(shared?.agents.map((a) => a.id)).not.toContain("a2");
  });
});
