import { ensureDefaultCatalog } from "@/modules/catalog/service";
import { ensureDefaultRoles } from "@/modules/roles/service";
import { ensureDefaultSettings } from "@/modules/settings/service";
import { ensureDefaultActivities, ensureDefaultTeams } from "@/modules/teams/service";

/** Idempotent base data every environment needs: roles, settings, catalog, teams and activities. */
export async function setupBase() {
  await ensureDefaultRoles();
  await ensureDefaultSettings();
  await ensureDefaultCatalog();
  const teams = await ensureDefaultTeams();
  await ensureDefaultActivities();
  return teams;
}
