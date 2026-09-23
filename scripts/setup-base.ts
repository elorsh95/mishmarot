import { ensureDefaultCatalog } from "@/modules/catalog/service";
import { ensureDefaultRoles } from "@/modules/roles/service";
import { ensureDefaultSettings } from "@/modules/settings/service";
import { ensureDefaultTeams } from "@/modules/teams/service";

/** Idempotent base data every environment needs: roles, settings, catalog and teams. */
export async function setupBase() {
  await ensureDefaultRoles();
  await ensureDefaultSettings();
  await ensureDefaultCatalog();
  return ensureDefaultTeams();
}
