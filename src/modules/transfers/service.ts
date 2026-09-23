import { z } from "zod";
import { db } from "@/lib/firebase/admin";
import { col, COLLECTIONS, fromDoc, fromDocOrNull, serverNow } from "@/lib/firebase/collections";
import { todayIso } from "@/lib/dates";
import { DomainError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { emit } from "@/lib/events";
import { readTeamMoveRefs, writeTeamMove } from "@/modules/agents/service";
import { agentName, type Agent } from "@/modules/agents/types";
import { auditInTx } from "@/modules/audit/service";
import { canForTeam, teamScope, type Actor } from "@/modules/permissions/check";
import { listAllTeams } from "@/modules/teams/service";
import type { AgentBrief, TransferRequest } from "./types";

/**
 * Moving an agent between teams: the manager of the destination team asks, the manager of the
 * agent's current team approves. Users with an "all" scope (admin, center manager) may decide any.
 */

export * from "./types";

/** Active agents outside the actor's teams, for picking whom to request. */
export async function listTransferCandidates(actor: Actor): Promise<AgentBrief[]> {
  const scope = teamScope(actor, "transfers.request");
  if (scope !== "all" && scope.length === 0) return [];
  const [snap, teams] = await Promise.all([
    col(COLLECTIONS.agents).where("isActive", "==", true).get(),
    listAllTeams(),
  ]);
  const teamNames = new Map(teams.map((t) => [t.id, t.name]));
  return snap.docs
    .map((d) => fromDoc<Agent>(d))
    .filter((a) => scope === "all" || !scope.includes(a.teamId))
    .map((a) => ({
      id: a.id,
      name: agentName(a),
      employeeNumber: a.employeeNumber,
      teamId: a.teamId,
      teamName: teamNames.get(a.teamId) ?? "",
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "he"));
}

export async function listTransfers(actor: Actor): Promise<{
  incoming: TransferRequest[];
  outgoing: TransferRequest[];
  history: TransferRequest[];
}> {
  const decideScope = teamScope(actor, "transfers.decide");
  const requestScope = teamScope(actor, "transfers.request");
  const snap = await col(COLLECTIONS.transfers).orderBy("createdAt", "desc").limit(300).get();
  const all = snap.docs.map((d) => fromDoc<TransferRequest>(d));
  const inScope = (scope: "all" | string[], teamId: string) =>
    scope === "all" || scope.includes(teamId);

  const visible = all.filter(
    (t) =>
      inScope(decideScope, t.fromTeamId) ||
      inScope(requestScope, t.toTeamId) ||
      t.requestedBy === actor.id,
  );
  return {
    incoming: visible.filter((t) => t.status === "pending" && inScope(decideScope, t.fromTeamId)),
    outgoing: visible.filter(
      (t) =>
        t.status === "pending" &&
        !inScope(decideScope, t.fromTeamId) &&
        (inScope(requestScope, t.toTeamId) || t.requestedBy === actor.id),
    ),
    history: visible.filter((t) => t.status !== "pending"),
  };
}

export async function countIncomingTransfers(actor: Actor): Promise<number> {
  return (await listTransfers(actor)).incoming.length;
}

export const transferRequestSchema = z.object({
  agentId: z.string().min(1, "יש לבחור נציג"),
  toTeamId: z.string().min(1, "יש לבחור צוות יעד"),
  note: z.string().trim().max(500).default(""),
});

export async function requestTransfer(actor: Actor, input: z.input<typeof transferRequestSchema>) {
  const data = transferRequestSchema.parse(input);
  if (!canForTeam(actor, "transfers.request", data.toTeamId)) {
    throw new ForbiddenError("ניתן לבקש העברה רק לצוות שבניהולך");
  }
  const teams = await listAllTeams();
  const toTeam = teams.find((t) => t.id === data.toTeamId && t.isActive);
  if (!toTeam) throw new DomainError("צוות היעד לא קיים או לא פעיל");

  const ref = col(COLLECTIONS.transfers).doc();
  await db().runTransaction(async (tx) => {
    const agent = fromDocOrNull<Agent>(await tx.get(col(COLLECTIONS.agents).doc(data.agentId)));
    if (!agent || !agent.isActive) throw new NotFoundError("הנציג לא נמצא או לא פעיל");
    if (agent.teamId === data.toTeamId) throw new DomainError("הנציג כבר נמצא בצוות זה");
    const open = await tx.get(
      col(COLLECTIONS.transfers)
        .where("agentId", "==", data.agentId)
        .where("status", "==", "pending")
        .limit(1),
    );
    if (!open.empty) throw new DomainError("כבר קיימת בקשת העברה פתוחה עבור נציג זה");

    const fromTeam = teams.find((t) => t.id === agent.teamId);
    const doc = {
      agentId: agent.id,
      agentName: agentName(agent),
      employeeNumber: agent.employeeNumber,
      fromTeamId: agent.teamId,
      toTeamId: data.toTeamId,
      status: "pending" as const,
      note: data.note,
      requestedBy: actor.id,
      requestedByName: actor.fullName,
      decidedBy: null,
      decidedByName: null,
      decisionNote: "",
      decidedAt: null,
    };
    tx.set(ref, { ...doc, createdAt: serverNow(), updatedAt: serverNow() });
    for (const teamId of [agent.teamId, data.toTeamId]) {
      auditInTx(tx, actor, {
        action: "transfer.request",
        entityType: "transfer",
        entityId: ref.id,
        teamId,
        summary: `נשלחה בקשה להעביר את ${doc.agentName} מצוות ${fromTeam?.name ?? ""} לצוות ${toTeam.name}`,
        after: doc,
      });
    }
  });
  emit("transfer.requested", { transferId: ref.id });
  return ref.id;
}

export const transferDecisionSchema = z.object({
  transferId: z.string().min(1),
  decision: z.enum(["approved", "rejected"]),
  note: z.string().trim().max(500).default(""),
});

export async function decideTransfer(actor: Actor, input: z.input<typeof transferDecisionSchema>) {
  const { transferId, decision, note } = transferDecisionSchema.parse(input);
  const today = todayIso();
  const teams = await listAllTeams();
  const teamName = (id: string) => teams.find((t) => t.id === id)?.name ?? "";

  const stale = await db().runTransaction(async (tx) => {
    const ref = col(COLLECTIONS.transfers).doc(transferId);
    const transfer = fromDocOrNull<TransferRequest>(await tx.get(ref));
    if (!transfer) throw new NotFoundError("הבקשה לא נמצאה");
    if (!canForTeam(actor, "transfers.decide", transfer.fromTeamId)) {
      throw new ForbiddenError("רק מנהל הצוות הנוכחי של הנציג יכול לאשר את ההעברה");
    }
    if (transfer.status !== "pending") throw new DomainError("הבקשה כבר טופלה");
    const agent = fromDocOrNull<Agent>(await tx.get(col(COLLECTIONS.agents).doc(transfer.agentId)));
    if (!agent || agent.teamId !== transfer.fromTeamId) {
      tx.update(ref, { status: "cancelled", updatedAt: serverNow() });
      return true;
    }
    const moveRefs = decision === "approved" ? await readTeamMoveRefs(tx, agent.id, today) : null;

    tx.update(ref, {
      status: decision,
      decidedBy: actor.id,
      decidedByName: actor.fullName,
      decisionNote: note,
      decidedAt: serverNow(),
      updatedAt: serverNow(),
    });
    if (moveRefs) writeTeamMove(tx, moveRefs, transfer.toTeamId);
    const summary =
      decision === "approved"
        ? `אושרה העברת ${transfer.agentName} מצוות ${teamName(transfer.fromTeamId)} לצוות ${teamName(transfer.toTeamId)}`
        : `נדחתה העברת ${transfer.agentName} לצוות ${teamName(transfer.toTeamId)}`;
    for (const teamId of [transfer.fromTeamId, transfer.toTeamId]) {
      auditInTx(tx, actor, {
        action: decision === "approved" ? "transfer.approve" : "transfer.reject",
        entityType: "transfer",
        entityId: transferId,
        teamId,
        summary: note ? `${summary}: ${note}` : summary,
        before: { status: "pending", teamId: transfer.fromTeamId },
        after: {
          status: decision,
          teamId: decision === "approved" ? transfer.toTeamId : transfer.fromTeamId,
        },
      });
    }
    return false;
  });
  // Thrown after commit so the cancellation above is saved.
  if (stale) throw new DomainError("הנציג כבר לא נמצא בצוות המקור. הבקשה בוטלה");
  emit("transfer.decided", { transferId, status: decision });
}

export async function cancelTransfer(actor: Actor, transferId: string) {
  await db().runTransaction(async (tx) => {
    const ref = col(COLLECTIONS.transfers).doc(transferId);
    const transfer = fromDocOrNull<TransferRequest>(await tx.get(ref));
    if (!transfer) throw new NotFoundError("הבקשה לא נמצאה");
    if (transfer.status !== "pending") throw new DomainError("הבקשה כבר טופלה");
    if (transfer.requestedBy !== actor.id && teamScope(actor, "transfers.decide") !== "all") {
      throw new ForbiddenError("רק מי ששלח את הבקשה יכול לבטל אותה");
    }
    tx.update(ref, { status: "cancelled", updatedAt: serverNow() });
    auditInTx(tx, actor, {
      action: "transfer.cancel",
      entityType: "transfer",
      entityId: transferId,
      teamId: transfer.toTeamId,
      summary: `בוטלה בקשת העברה של ${transfer.agentName}`,
    });
  });
}
