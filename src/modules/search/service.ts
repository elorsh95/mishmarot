import { chunk, col, COLLECTIONS, fromDoc } from "@/lib/firebase/collections";
import { agentName, type Agent } from "@/modules/agents/types";
import { can, type Actor } from "@/modules/permissions/check";
import { teamsForActor } from "@/modules/teams/service";
import type { SearchIndex } from "./types";

/** The teams whose schedule the actor can view, and their agents (for jumping to them). */
export async function searchIndex(actor: Actor): Promise<SearchIndex> {
  if (!can(actor, "schedule.view")) return { teams: [], agents: [] };
  const teams = await teamsForActor(actor, "schedule.view");
  if (teams.length === 0) return { teams: [], agents: [] };
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const snaps = await Promise.all(
    chunk(teams.map((t) => t.id)).map((ids) =>
      col(COLLECTIONS.agents).where("teamId", "in", ids).get(),
    ),
  );
  const agents = snaps
    .flatMap((s) => s.docs.map((d) => fromDoc<Agent>(d)))
    .map((a) => ({
      id: a.id,
      name: agentName(a),
      employeeNumber: a.employeeNumber ?? "",
      teamId: a.teamId,
      teamName: teamName.get(a.teamId) ?? "",
      isActive: a.isActive,
    }))
    .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name, "he"));
  return { teams: teams.map((t) => ({ id: t.id, name: t.name })), agents };
}
