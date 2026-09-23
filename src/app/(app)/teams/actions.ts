"use server";

import { z } from "zod";
import { runAction } from "@/lib/action";
import { createTeam, teamInputSchema, updateTeam } from "@/modules/teams/service";

const REVALIDATE = ["/teams", "/users", "/schedule", "/agents"];

export async function saveTeamAction(teamId: string | null, input: unknown) {
  return runAction(
    async (actor) => {
      const data = teamInputSchema.parse(input);
      if (teamId) {
        await updateTeam(actor, z.string().min(1).parse(teamId), data);
        return teamId;
      }
      return createTeam(actor, data);
    },
    { revalidate: REVALIDATE, message: teamId ? "הצוות עודכן" : "הצוות נוצר" },
  );
}
