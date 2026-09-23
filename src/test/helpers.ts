import { col, COLLECTIONS, serverNow } from "@/lib/firebase/collections";
import { DEFAULT_ROLES, SYSTEM_ROLE_IDS } from "@/modules/permissions/catalog";
import type { Actor } from "@/modules/permissions/check";
import { ensureDefaultCatalog, getCatalog } from "@/modules/catalog/service";
import { ensureDefaultSettings } from "@/modules/settings/service";
import { ensureDefaultRoles } from "@/modules/roles/service";

const PROJECT = process.env.FIREBASE_PROJECT_ID ?? "demo-mishmarot";

export async function clearEmulator() {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  if (!host) throw new Error("Integration tests must run against the Firestore emulator");
  await fetch(`http://${host}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: "DELETE",
  });
  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  if (authHost) {
    await fetch(`http://${authHost}/emulator/v1/projects/${PROJECT}/accounts`, {
      method: "DELETE",
    });
  }
}

export async function baseData() {
  await ensureDefaultRoles();
  await ensureDefaultSettings();
  await ensureDefaultCatalog();
  const catalog = await getCatalog();
  const find = <T extends { name: string }>(list: T[], name: string) =>
    list.find((i) => i.name === name)!;
  return {
    morning: find(catalog.shifts, "בוקר"),
    evening: find(catalog.shifts, "ערב"),
    office: find(catalog.locations, "מוקד"),
    home: find(catalog.locations, "בית"),
    vacation: find(catalog.absenceTypes, "חופשה"),
  };
}

export async function createTeamDoc(id: string, name: string, managerIds: string[] = []) {
  await col(COLLECTIONS.teams)
    .doc(id)
    .set({ name, isActive: true, managerIds, sortOrder: 0, createdAt: serverNow() });
}

export async function createAgentDoc(
  id: string,
  teamId: string,
  extra: Record<string, unknown> = {},
) {
  await col(COLLECTIONS.agents)
    .doc(id)
    .set({
      employeeNumber: id,
      firstName: "נציג",
      lastName: id,
      teamId,
      isActive: true,
      monthlyQuota: null,
      defaultShiftId: null,
      defaultLocationId: null,
      defaultDays: [0, 1, 2, 3, 4],
      notes: "",
      createdAt: serverNow(),
      ...extra,
    });
}

function roleActor(roleId: string, id: string, managedTeamIds: string[] = []): Actor {
  const role = DEFAULT_ROLES.find((r) => r.id === roleId)!;
  return { id, fullName: id, roleId, permissions: role.permissions, managedTeamIds };
}

export const actors = {
  admin: () => roleActor(SYSTEM_ROLE_IDS.admin, "admin-user"),
  centerManager: () => roleActor(SYSTEM_ROLE_IDS.centerManager, "center-user"),
  teamManager: (teams: string[], id = "tm-user") =>
    roleActor(SYSTEM_ROLE_IDS.teamManager, id, teams),
};
