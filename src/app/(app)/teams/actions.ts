"use server";

import { z } from "zod";
import { runAction } from "@/lib/action";
import {
  activityInputSchema,
  createTeam,
  deleteActivity,
  saveActivity,
  teamInputSchema,
  updateTeam,
} from "@/modules/teams/service";

const REVALIDATE = ["/teams", "/users", "/schedule", "/agents", "/attendance", "/reports", "/"];

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

export async function saveActivityAction(activityId: string | null, input: unknown) {
  return runAction(
    (actor) =>
      saveActivity(
        actor,
        activityId ? z.string().min(1).parse(activityId) : null,
        activityInputSchema.parse(input),
      ),
    { revalidate: REVALIDATE, message: activityId ? "הפעילות עודכנה" : "הפעילות נוצרה" },
  );
}

export async function deleteActivityAction(activityId: string) {
  return runAction((actor) => deleteActivity(actor, z.string().min(1).parse(activityId)), {
    revalidate: REVALIDATE,
    message: "הפעילות נמחקה",
  });
}
