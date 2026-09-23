"use server";

import { runAction } from "@/lib/action";
import { cancelTransfer, decideTransfer, requestTransfer } from "@/modules/transfers/service";

const REVALIDATE = ["/transfers", "/agents", "/schedule"];

export async function requestTransferAction(input: {
  agentId: string;
  toTeamId: string;
  note: string;
}) {
  return runAction((actor) => requestTransfer(actor, input), {
    revalidate: REVALIDATE,
    message: "הבקשה נשלחה למנהל הצוות הנוכחי של הנציג",
  });
}

export async function decideTransferAction(input: {
  transferId: string;
  decision: "approved" | "rejected";
  note: string;
}) {
  return runAction((actor) => decideTransfer(actor, input), {
    revalidate: REVALIDATE,
    message: input.decision === "approved" ? "ההעברה אושרה" : "הבקשה נדחתה",
  });
}

export async function cancelTransferAction(transferId: string) {
  return runAction((actor) => cancelTransfer(actor, transferId), {
    revalidate: REVALIDATE,
    message: "הבקשה בוטלה",
  });
}
