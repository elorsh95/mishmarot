"use server";

import { runAction } from "@/lib/action";
import { createAgent, updateAgent, type AgentInput } from "@/modules/agents/service";

const REVALIDATE = ["/agents", "/schedule", "/approvals"];

export async function saveAgentAction(agentId: string | null, input: AgentInput) {
  return runAction(
    async (actor) => {
      if (agentId) await updateAgent(actor, agentId, input);
      else await createAgent(actor, input);
      return null;
    },
    { revalidate: REVALIDATE, message: agentId ? "פרטי הנציג עודכנו" : "הנציג נוסף" },
  );
}
