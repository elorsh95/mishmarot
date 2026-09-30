import { beforeEach, describe, expect, it } from "vitest";
import { col, COLLECTIONS, fromDoc } from "@/lib/firebase/collections";
import type { AuditEntry } from "@/modules/audit/types";
import { actors, baseData, clearEmulator, createTeamDoc } from "@/test/helpers";
import {
  createTeam,
  deleteActivity,
  ensureDefaultActivities,
  ensureDefaultTeams,
  getTeam,
  listActivities,
  listAllTeams,
  saveActivity,
  updateTeam,
} from "./service";

beforeEach(async () => {
  await clearEmulator();
  await baseData();
});

const teamInput = (name: string, activityId: string | null) => ({
  name,
  isActive: true,
  managerIds: [],
  sortOrder: 1,
  minMorning: 0,
  minEvening: 0,
  activityId,
});

describe("activities", () => {
  it("seeds the default activities and assigns the teams by name", async () => {
    await ensureDefaultTeams();
    await ensureDefaultActivities();
    const activities = await listActivities();
    expect(activities.map((a) => a.name)).toEqual(["רכב חדש", "פסיפיק"]);
    const teams = await listAllTeams();
    const of = (id: string) =>
      teams
        .filter((t) => t.activityId === id)
        .map((t) => t.name)
        .sort();
    expect(of(activities[0].id)).toEqual(["אקספנג", "דאצ׳יה", "ניסאן", "צ׳רי", "רנו"].sort());
    expect(of(activities[1].id)).toEqual(["השכרה", "ליסינג", "רכב משומש"].sort());
    expect(teams.find((t) => t.name === "דיגיטל")?.activityId).toBeNull();

    // Idempotent: an existing setup is left as the admin set it.
    await saveActivity(actors.admin(), activities[1].id, { name: "פסיפיק", sortOrder: 5 });
    await ensureDefaultActivities();
    expect(await listActivities()).toHaveLength(2);
  });

  it("creates, renames and deletes an activity, with an audit entry each", async () => {
    const admin = actors.admin();
    const id = await saveActivity(admin, null, { name: "רכב חדש", sortOrder: 1 });
    await createTeamDoc("renault", "רנו");
    await updateTeam(admin, "renault", teamInput("רנו", id));
    expect((await getTeam("renault"))?.activityId).toBe(id);

    await saveActivity(admin, id, { name: "רכב חדש 2026", sortOrder: 1 });
    expect((await listActivities())[0].name).toBe("רכב חדש 2026");
    await expect(saveActivity(admin, null, { name: "רכב חדש 2026", sortOrder: 2 })).rejects.toThrow(
      "כבר קיימת פעילות בשם זה",
    );

    await deleteActivity(admin, id);
    expect(await listActivities()).toEqual([]);
    expect((await getTeam("renault"))?.activityId).toBeNull();

    const audit = (
      await col(COLLECTIONS.auditLogs).where("entityType", "==", "activity").get()
    ).docs
      .map((d) => fromDoc<AuditEntry>(d).action)
      .sort();
    expect(audit).toEqual(["activity.create", "activity.delete", "activity.update"]);
  });

  it("rejects a team in an unknown activity", async () => {
    await expect(createTeam(actors.admin(), teamInput("חדש", "nope"))).rejects.toThrow(
      "הפעילות לא נמצאה",
    );
  });

  it("needs teams.manage", async () => {
    await expect(
      saveActivity(actors.teamManager(["renault"]), null, { name: "רכב חדש", sortOrder: 1 }),
    ).rejects.toThrow();
  });
});
