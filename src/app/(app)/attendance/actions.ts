"use server";

import { z } from "zod";
import { runAction } from "@/lib/action";
import {
  clearAttendance,
  recordAttendance,
  recordInputSchema,
  recordMany,
} from "@/modules/attendance/service";

const REVALIDATE = ["/attendance", "/"];

export async function recordAttendanceAction(input: unknown) {
  return runAction((actor) => recordAttendance(actor, recordInputSchema.parse(input)), {
    revalidate: REVALIDATE,
  });
}

export async function clearAttendanceAction(date: string, agentId: string) {
  return runAction(
    (actor) => clearAttendance(actor, z.string().parse(date), z.string().min(1).parse(agentId)),
    { revalidate: REVALIDATE, message: "הסימון בוטל" },
  );
}

export async function recordManyAction(date: string, agentIds: string[], statusId: string) {
  return runAction(
    async (actor) => {
      const result = await recordMany(actor, z.string().parse(date), agentIds, statusId);
      return {
        ...result,
        summary: `סומנו ${result.recorded} נציגים${result.skipped ? ` · ${result.skipped} דולגו` : ""}`,
      };
    },
    { revalidate: REVALIDATE },
  );
}
