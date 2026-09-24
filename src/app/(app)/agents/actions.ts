"use server";

import { runAction } from "@/lib/action";
import { DomainError } from "@/lib/errors";
import { importAgents } from "@/modules/agents/import";
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

const MAX_FILE_BYTES = 2 * 1024 * 1024;

/** Preview (dryRun=1) or run an Excel/CSV import. The file is re-read on the real run. */
export async function importAgentsAction(formData: FormData) {
  const dryRun = formData.get("dryRun") === "1";
  return runAction(
    async (actor) => {
      const file = formData.get("file");
      if (!(file instanceof File) || file.size === 0) throw new DomainError("יש לבחור קובץ");
      if (file.size > MAX_FILE_BYTES) throw new DomainError("הקובץ גדול מדי (עד 2MB)");
      const defaultTeamId = formData.get("defaultTeamId");
      return importAgents(
        actor,
        { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) },
        {
          defaultTeamId: typeof defaultTeamId === "string" && defaultTeamId ? defaultTeamId : null,
          dryRun,
        },
      );
    },
    { revalidate: dryRun ? [] : REVALIDATE },
  );
}
