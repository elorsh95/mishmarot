"use server";

import { z } from "zod";
import { runAction } from "@/lib/action";
import { approveMany, decideApproval } from "@/modules/approvals/service";

const REVALIDATE = ["/approvals", "/schedule", "/"];

export async function decideAction(input: {
  approvalId: string;
  decision: "approved" | "rejected";
  note?: string;
}) {
  return runAction((actor) => decideApproval(actor, input), {
    revalidate: REVALIDATE,
    message: input.decision === "approved" ? "הבקשה אושרה" : "הבקשה נדחתה",
  });
}

export async function approveManyAction(approvalIds: string[]) {
  return runAction(
    async (actor) => {
      const ids = z.array(z.string().min(1)).max(200).parse(approvalIds);
      const result = await approveMany(actor, ids);
      return result;
    },
    { revalidate: REVALIDATE },
  );
}
