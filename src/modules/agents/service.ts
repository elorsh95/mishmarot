import type { Transaction } from "firebase-admin/firestore";
import { z } from "zod";
import { db } from "@/lib/firebase/admin";
import { col, COLLECTIONS, fromDoc, fromDocOrNull, serverNow } from "@/lib/firebase/collections";
import { monthOf, todayIso, type IsoDate } from "@/lib/dates";
import { DomainError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { auditInTx } from "@/modules/audit/service";
import { assertCanForTeam, canForTeam, teamScope, type Actor } from "@/modules/permissions/check";
import { recomputeAgentMonths } from "@/modules/schedule/engine";
import { getTeam } from "@/modules/teams/service";
import { agentName, type Agent } from "./types";

export const agentInputSchema = z.object({
  employeeNumber: z
    .string()
    .trim()
    .min(1, "יש להזין מספר עובד")
    .max(20)
    .regex(/^[0-9A-Za-z-]+$/, "מספר עובד יכול להכיל ספרות ואותיות באנגלית בלבד"),
  firstName: z.string().trim().min(1, "יש להזין שם פרטי").max(40),
  lastName: z.string().trim().min(1, "יש להזין שם משפחה").max(40),
  teamId: z.string().min(1, "יש לבחור צוות"),
  isActive: z.boolean().default(true),
  monthlyQuota: z.coerce.number().int().min(0).max(31).nullable().default(null),
  defaultShiftId: z.string().nullable().default(null),
  defaultLocationId: z.string().nullable().default(null),
  defaultDays: z.array(z.number().int().min(0).max(6)).default([0, 1, 2, 3, 4]),
  notes: z.string().trim().max(500).default(""),
});
export type AgentInput = z.input<typeof agentInputSchema>;

export async function getAgent(id: string): Promise<Agent | null> {
  return fromDocOrNull<Agent>(await col(COLLECTIONS.agents).doc(id).get());
}

export async function listAgents(
  actor: Actor,
  { teamId, includeInactive = false }: { teamId?: string; includeInactive?: boolean } = {},
): Promise<Agent[]> {
  const scope = teamScope(actor, "agents.view");
  if (scope !== "all" && scope.length === 0) return [];
  let teamIds: string[] | "all" = scope;
  if (teamId) {
    if (scope !== "all" && !scope.includes(teamId)) return [];
    teamIds = [teamId];
  }
  const docs =
    teamIds === "all"
      ? (await col(COLLECTIONS.agents).get()).docs
      : (
          await Promise.all(
            teamIds.map((t) => col(COLLECTIONS.agents).where("teamId", "==", t).get()),
          )
        ).flatMap((s) => s.docs);
  return docs
    .map((d) => fromDoc<Agent>(d))
    .filter((a) => includeInactive || a.isActive)
    .sort(
      (a, b) =>
        Number(b.isActive) - Number(a.isActive) || agentName(a).localeCompare(agentName(b), "he"),
    );
}

async function assertEmployeeNumberFree(
  tx: Transaction,
  employeeNumber: string,
  exceptId?: string,
) {
  const dup = await tx.get(
    col(COLLECTIONS.agents).where("employeeNumber", "==", employeeNumber).limit(2),
  );
  if (dup.docs.some((d) => d.id !== exceptId)) {
    throw new DomainError(`מספר עובד ${employeeNumber} כבר קיים במערכת`);
  }
}

export async function createAgent(actor: Actor, input: AgentInput): Promise<string> {
  const data = agentInputSchema.parse(input);
  assertCanForTeam(actor, "agents.manage", data.teamId);
  if (data.monthlyQuota !== null && !canForTeam(actor, "agents.quota", data.teamId)) {
    data.monthlyQuota = null; // only quota managers may set a personal quota
  }
  const team = await getTeam(data.teamId);
  if (!team || !team.isActive) throw new DomainError("הצוות לא קיים או לא פעיל");
  const ref = col(COLLECTIONS.agents).doc();
  await db().runTransaction(async (tx) => {
    await assertEmployeeNumberFree(tx, data.employeeNumber);
    tx.set(ref, { ...data, createdAt: serverNow(), updatedAt: serverNow() });
    auditInTx(tx, actor, {
      action: "agent.create",
      entityType: "agent",
      entityId: ref.id,
      teamId: data.teamId,
      summary: `נוסף נציג ${agentName(data)} (${data.employeeNumber}) לצוות ${team.name}`,
      after: data,
    });
  });
  return ref.id;
}

export async function updateAgent(actor: Actor, agentId: string, input: AgentInput) {
  const data = agentInputSchema.parse(input);
  const today = todayIso();
  let quotaChanged = false;

  await db().runTransaction(async (tx) => {
    const ref = col(COLLECTIONS.agents).doc(agentId);
    const before = fromDocOrNull<Agent>(await tx.get(ref));
    if (!before) throw new NotFoundError("הנציג לא נמצא");
    assertCanForTeam(actor, "agents.manage", before.teamId);

    const teamChanged = data.teamId !== before.teamId;
    if (teamChanged) {
      // Moving between teams directly requires managing both. Otherwise use a transfer request.
      if (!canForTeam(actor, "agents.manage", data.teamId)) {
        throw new ForbiddenError("להעברת נציג לצוות אחר יש לשלוח בקשת העברה");
      }
      const target = await tx.get(col(COLLECTIONS.teams).doc(data.teamId));
      if (!target.exists || target.get("isActive") === false) {
        throw new DomainError("צוות היעד לא קיים או לא פעיל");
      }
    }
    if (data.monthlyQuota !== before.monthlyQuota) {
      if (!canForTeam(actor, "agents.quota", before.teamId))
        data.monthlyQuota = before.monthlyQuota;
      else quotaChanged = true;
    }
    if (data.employeeNumber !== before.employeeNumber) {
      await assertEmployeeNumberFree(tx, data.employeeNumber, agentId);
    }
    const moveRefs = teamChanged ? await readTeamMoveRefs(tx, agentId, today) : null;

    tx.update(ref, { ...data, updatedAt: serverNow() });
    if (moveRefs) writeTeamMove(tx, moveRefs, data.teamId);
    auditInTx(tx, actor, {
      action: teamChanged ? "agent.move" : "agent.update",
      entityType: "agent",
      entityId: agentId,
      teamId: before.teamId,
      summary: teamChanged
        ? `הנציג ${agentName(data)} הועבר לצוות אחר`
        : `עודכנו פרטי הנציג ${agentName(data)}`,
      before,
      after: data,
    });
    if (teamChanged) {
      auditInTx(tx, actor, {
        action: "agent.move",
        entityType: "agent",
        entityId: agentId,
        teamId: data.teamId,
        summary: `הנציג ${agentName(data)} הועבר לצוות זה`,
        before: { teamId: before.teamId },
        after: { teamId: data.teamId },
      });
    }
  });

  if (quotaChanged) {
    // Re-run the quota rule for the current month and every later month the agent has entries in.
    const from = `${monthOf(today)}-01`;
    const snap = await col(COLLECTIONS.assignments)
      .where("agentId", "==", agentId)
      .where("date", ">=", from)
      .select("month")
      .get();
    const months = [...new Set([monthOf(today), ...snap.docs.map((d) => String(d.get("month")))])];
    await recomputeAgentMonths(actor, agentId, months.sort());
  }
}

export interface TeamMoveRefs {
  agentRef: FirebaseFirestore.DocumentReference;
  assignmentRefs: FirebaseFirestore.DocumentReference[];
  approvalRefs: FirebaseFirestore.DocumentReference[];
}

/**
 * Read phase of moving an agent: today's and future entries move with the agent to the new team,
 * as do their pending approvals. Past entries stay with the old team.
 */
export async function readTeamMoveRefs(
  tx: Transaction,
  agentId: string,
  fromDate: IsoDate,
): Promise<TeamMoveRefs> {
  const [future, approvals] = await Promise.all([
    tx.get(
      col(COLLECTIONS.assignments).where("agentId", "==", agentId).where("date", ">=", fromDate),
    ),
    tx.get(
      col(COLLECTIONS.approvals).where("agentId", "==", agentId).where("status", "==", "pending"),
    ),
  ]);
  return {
    agentRef: col(COLLECTIONS.agents).doc(agentId),
    assignmentRefs: future.docs.map((d) => d.ref),
    approvalRefs: approvals.docs.filter((d) => String(d.get("date")) >= fromDate).map((d) => d.ref),
  };
}

export function writeTeamMove(tx: Transaction, refs: TeamMoveRefs, toTeamId: string) {
  tx.update(refs.agentRef, { teamId: toTeamId, updatedAt: serverNow() });
  for (const ref of refs.assignmentRefs)
    tx.update(ref, { teamId: toTeamId, updatedAt: serverNow() });
  for (const ref of refs.approvalRefs) tx.update(ref, { teamId: toTeamId, updatedAt: serverNow() });
}
