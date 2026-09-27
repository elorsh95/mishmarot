import { col, COLLECTIONS, fromDoc } from "@/lib/firebase/collections";
import type { IsoDate } from "@/lib/dates";
import { NotFoundError } from "@/lib/errors";
import type { AuditEntry } from "@/modules/audit/types";
import { assertCanForTeam, type Actor } from "@/modules/permissions/check";
import { assignmentId, type CellHistoryItem } from "./types";

/**
 * Who changed a schedule cell and when: the audit entries of the assignment and of the
 * approval requests opened for it, newest first. Visible to whoever can view the schedule.
 */
export async function cellHistory(
  actor: Actor,
  agentId: string,
  date: IsoDate,
): Promise<CellHistoryItem[]> {
  const id = assignmentId(agentId, date);
  const [agentSnap, entrySnap, approvalsSnap] = await Promise.all([
    col(COLLECTIONS.agents).doc(agentId).get(),
    col(COLLECTIONS.assignments).doc(id).get(),
    col(COLLECTIONS.approvals).where("agentId", "==", agentId).where("date", "==", date).get(),
  ]);
  if (!agentSnap.exists) throw new NotFoundError("הנציג לא נמצא");
  // The cell belongs to the team it was scheduled in (the agent may have moved since).
  const teamId = (entrySnap.get("teamId") as string | undefined) ?? String(agentSnap.get("teamId"));
  assertCanForTeam(actor, "schedule.view", teamId);

  const entityIds = [id, ...approvalsSnap.docs.map((d) => d.id)].slice(0, 30);
  const snap = await col(COLLECTIONS.auditLogs)
    .where("entityId", "in", entityIds)
    .orderBy("createdAt", "desc")
    .limit(30)
    .get();
  return snap.docs.map((d) => {
    const e = fromDoc<AuditEntry>(d);
    return { id: e.id, actorName: e.actorName, summary: e.summary, createdAt: e.createdAt };
  });
}
