import type { Query, Transaction, WriteBatch } from "firebase-admin/firestore";
import { col, COLLECTIONS, fromDoc, serverNow } from "@/lib/firebase/collections";
import { assertCan, teamScope, type Actor } from "@/modules/permissions/check";
import type { AuditEntityType, AuditEntry } from "./types";

export interface AuditInput {
  action: string;
  entityType: AuditEntityType;
  entityId: string;
  teamId?: string | null;
  summary: string;
  before?: object | null;
  after?: object | null;
}

type ActorRef = Pick<Actor, "id" | "fullName"> | null;

function toDoc(actor: ActorRef, input: AuditInput) {
  return {
    actorId: actor?.id ?? null,
    actorName: actor?.fullName ?? "מערכת",
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    teamId: input.teamId ?? null,
    summary: input.summary,
    before: input.before ? stripUndefined(input.before) : null,
    after: input.after ? stripUndefined(input.after) : null,
    createdAt: serverNow(),
  };
}

function stripUndefined(obj: object): Record<string, unknown> {
  return JSON.parse(JSON.stringify(obj)) as Record<string, unknown>;
}

/** Records an audit entry inside the same transaction as the change it describes. */
export function auditInTx(tx: Transaction | WriteBatch, actor: ActorRef, input: AuditInput) {
  const ref = col(COLLECTIONS.auditLogs).doc();
  (tx as Transaction).set(ref, toDoc(actor, input));
}

export async function audit(actor: ActorRef, input: AuditInput) {
  await col(COLLECTIONS.auditLogs).add(toDoc(actor, input));
}

export interface AuditFilter {
  entityType?: AuditEntityType;
  teamId?: string;
  entityId?: string;
  limit?: number;
}

export async function listAudit(actor: Actor, filter: AuditFilter = {}): Promise<AuditEntry[]> {
  assertCan(actor, "audit.view");
  const scope = teamScope(actor, "audit.view");
  const limit = Math.min(filter.limit ?? 200, 500);

  let query: Query = col(COLLECTIONS.auditLogs);
  if (filter.entityId) {
    query = query.where("entityId", "==", filter.entityId);
  } else if (filter.teamId) {
    if (scope !== "all" && !scope.includes(filter.teamId)) return [];
    query = query.where("teamId", "==", filter.teamId);
  } else if (scope !== "all") {
    if (scope.length === 0) return [];
    query = query.where("teamId", "in", scope.slice(0, 30));
  }
  if (filter.entityType) query = query.where("entityType", "==", filter.entityType);

  const snap = await query.orderBy("createdAt", "desc").limit(limit).get();
  const entries = snap.docs.map((d) => fromDoc<AuditEntry>(d));
  // entityId lookups are unscoped by query; enforce scope in memory
  return scope === "all"
    ? entries
    : entries.filter((e) => e.teamId !== null && scope.includes(e.teamId));
}
