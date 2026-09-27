import type { DocumentReference, Transaction } from "firebase-admin/firestore";
import { db } from "@/lib/firebase/admin";
import { col, COLLECTIONS, fromDoc, serverNow } from "@/lib/firebase/collections";
import {
  formatDateWithDay,
  monthOf,
  todayIso,
  weekStartOf,
  type IsoDate,
  type IsoMonth,
} from "@/lib/dates";
import { DomainError } from "@/lib/errors";
import { emit } from "@/lib/events";
import { agentName, type Agent } from "@/modules/agents/types";
import { auditInTx } from "@/modules/audit/service";
import { getDayInfosInTx } from "@/modules/calendar/service";
import { getCatalog, type Catalog } from "@/modules/catalog/service";
import type { Actor } from "@/modules/permissions/check";
import { getSettingsInTx } from "@/modules/settings/service";
import { computeQuotaStatuses } from "./quota";
import { describeEntry, editBlockReason, entryError } from "./rules";
import {
  assignmentId,
  QUOTA_STATUS_LABELS,
  weekId,
  type Assignment,
  type ChangeOp,
  type EntryInput,
  type QuotaStatus,
  type WeekStatus,
} from "./types";

/**
 * Every schedule change goes through applyChanges: single-cell edits, copying a week and
 * filling from defaults. In one transaction per group of agents it validates permissions and
 * locks, writes the entries, re-runs the monthly quota rule for each affected agent-month,
 * opens or cancels approval requests, and writes the audit log.
 */

export interface ApplyOptions {
  /** strict: the first problem throws. bulk: problematic ops are skipped and reported. */
  mode: "strict" | "bulk";
  today?: IsoDate;
}

export interface SkippedOp {
  agentId: string;
  date: IsoDate;
  reason: string;
}

export interface ApplyResult {
  changed: number;
  skipped: SkippedOp[];
  pendingApprovalIds: string[];
}

/** Agents per transaction, keeping each transaction well under Firestore's 500-write limit. */
const AGENTS_PER_TX = 6;

export async function applyChanges(
  actor: Actor,
  ops: ChangeOp[],
  options: ApplyOptions,
): Promise<ApplyResult> {
  const today = options.today ?? todayIso();
  const catalog = await getCatalog();
  const byAgent = new Map<string, ChangeOp[]>();
  for (const op of ops) {
    // last op wins for the same agent/day
    const list = (byAgent.get(op.agentId) ?? []).filter((o) => o.date !== op.date);
    byAgent.set(op.agentId, [...list, op]);
  }

  const agentIds = [...byAgent.keys()];
  const total: ApplyResult = { changed: 0, skipped: [], pendingApprovalIds: [] };
  for (let i = 0; i < agentIds.length; i += AGENTS_PER_TX) {
    const group = agentIds.slice(i, i + AGENTS_PER_TX);
    const groupOps = group.flatMap((id) => byAgent.get(id) ?? []);
    const result = await db().runTransaction((tx) =>
      applyInTx(tx, actor, groupOps, catalog, today, options.mode),
    );
    total.changed += result.changed;
    total.skipped.push(...result.skipped);
    total.pendingApprovalIds.push(...result.pendingApprovalIds);
  }
  if (total.pendingApprovalIds.length > 0) {
    emit("approval.requested", { approvalIds: total.pendingApprovalIds });
  }
  return total;
}

type Draft = Omit<Assignment, "createdAt" | "updatedAt">;

function sameEntry(a: Draft | undefined, b: EntryInput | null): boolean {
  if (!a || !b) return !a && !b;
  if (a.kind !== b.kind || (a.note ?? "") !== (b.note ?? "")) return false;
  return b.kind === "shift"
    ? a.shiftId === b.shiftId && a.locationId === b.locationId
    : a.absenceTypeId === b.absenceTypeId;
}

async function applyInTx(
  tx: Transaction,
  actor: Actor,
  ops: ChangeOp[],
  catalog: Catalog,
  today: IsoDate,
  mode: ApplyOptions["mode"],
): Promise<ApplyResult> {
  const result: ApplyResult = { changed: 0, skipped: [], pendingApprovalIds: [] };

  // ---------- reads (all before any write) ----------
  const settings = await getSettingsInTx(tx);
  const dayInfos = await getDayInfosInTx(
    tx,
    ops.filter((o) => o.entry).map((o) => o.date),
  );
  const agentIds = [...new Set(ops.map((o) => o.agentId))];
  const agentSnaps = await tx.getAll(...agentIds.map((id) => col(COLLECTIONS.agents).doc(id)));
  const agents = new Map(
    agentSnaps.filter((s) => s.exists).map((s) => [s.id, fromDoc<Agent>(s)] as const),
  );

  const monthKeys = new Map<string, { agentId: string; month: IsoMonth }>();
  for (const op of ops) {
    const month = monthOf(op.date);
    monthKeys.set(`${op.agentId}|${month}`, { agentId: op.agentId, month });
  }
  const monthEntries = new Map<string, Map<string, Assignment>>();
  for (const [key, { agentId, month }] of monthKeys) {
    const snap = await tx.get(
      col(COLLECTIONS.assignments).where("agentId", "==", agentId).where("month", "==", month),
    );
    monthEntries.set(key, new Map(snap.docs.map((d) => [d.id, fromDoc<Assignment>(d)])));
  }

  const weekKeys = new Set<string>();
  for (const op of ops) {
    const agent = agents.get(op.agentId);
    if (agent) weekKeys.add(weekId(agent.teamId, weekStartOf(op.date)));
  }
  const weekStatuses = new Map<string, WeekStatus>();
  if (weekKeys.size > 0) {
    const snaps = await tx.getAll(...[...weekKeys].map((id) => col(COLLECTIONS.weeks).doc(id)));
    for (const s of snaps) weekStatuses.set(s.id, (s.get("status") as WeekStatus) ?? "draft");
  }

  // ---------- validate ops ----------
  const skip = (op: ChangeOp, reason: string) => {
    if (mode === "strict") throw new DomainError(reason);
    result.skipped.push({ agentId: op.agentId, date: op.date, reason });
  };

  const accepted: ChangeOp[] = [];
  for (const op of ops) {
    const agent = agents.get(op.agentId);
    if (!agent) {
      skip(op, "הנציג לא נמצא");
      continue;
    }
    const weekStatus = weekStatuses.get(weekId(agent.teamId, weekStartOf(op.date))) ?? "draft";
    const blocked = editBlockReason(actor, agent.teamId, op.date, weekStatus, today);
    if (blocked) {
      skip(op, blocked);
      continue;
    }
    if (op.entry) {
      if (!agent.isActive) {
        skip(op, `הנציג ${agentName(agent)} אינו פעיל`);
        continue;
      }
      const error = entryError(catalog, op.entry, op.date, dayInfos[op.date]);
      if (error) {
        skip(op, error);
        continue;
      }
    }
    const existing = monthEntries
      .get(`${op.agentId}|${monthOf(op.date)}`)
      ?.get(assignmentId(op.agentId, op.date));
    if (sameEntry(existing, op.entry)) continue; // no-op
    accepted.push(op);
  }

  // ---------- compute & write per agent-month ----------
  const quotaLocations = new Set(catalog.locations.filter((l) => l.requiresQuota).map((l) => l.id));
  const opsByMonth = new Map<string, ChangeOp[]>();
  for (const op of accepted) {
    const key = `${op.agentId}|${monthOf(op.date)}`;
    opsByMonth.set(key, [...(opsByMonth.get(key) ?? []), op]);
  }

  for (const [key, monthOps] of opsByMonth) {
    const { agentId, month } = monthKeys.get(key)!;
    const agent = agents.get(agentId)!;
    const quota = agent.monthlyQuota ?? settings.defaultMonthlyQuota;
    const current = monthEntries.get(key)!;
    const next = new Map<string, Draft>(current);
    const targets = new Set<string>();

    for (const op of monthOps) {
      const id = assignmentId(agentId, op.date);
      targets.add(id);
      const old = current.get(id);
      if (!op.entry) {
        next.delete(id);
        continue;
      }
      // Keep a decided/pending state only if the day is still at the same location.
      const keepsQuotaState =
        old &&
        old.kind === op.entry.kind &&
        old.locationId === (op.entry.kind === "shift" ? op.entry.locationId : null);
      next.set(id, {
        id,
        agentId,
        teamId: agent.teamId,
        date: op.date,
        month,
        weekStart: weekStartOf(op.date),
        kind: op.entry.kind,
        shiftId: op.entry.kind === "shift" ? op.entry.shiftId : null,
        locationId: op.entry.kind === "shift" ? op.entry.locationId : null,
        absenceTypeId: op.entry.kind === "absence" ? op.entry.absenceTypeId : null,
        note: op.entry.note?.trim() ?? "",
        quotaStatus: keepsQuotaState ? old.quotaStatus : "none",
        approvalId: keepsQuotaState ? old.approvalId : null,
        createdBy: old?.createdBy ?? actor.id,
        updatedBy: actor.id,
      });
    }

    const computed = computeQuotaStatuses([...next.values()], quota, quotaLocations);

    for (const id of new Set([...current.keys(), ...next.keys()])) {
      const old = current.get(id);
      const draft = next.get(id);
      const isTarget = targets.has(id);
      const ref = col(COLLECTIONS.assignments).doc(id);

      if (!draft) {
        // deleted
        if (old?.quotaStatus === "pending" && old.approvalId) {
          cancelApproval(tx, old.approvalId, "deleted");
        }
        tx.delete(ref);
        auditInTx(tx, actor, {
          action: "assignment.delete",
          entityType: "assignment",
          entityId: id,
          teamId: agent.teamId,
          summary: `הוסר שיבוץ של ${agentName(agent)} ל${formatDateWithDay(old!.date)} (${describeEntry(catalog, old!)})`,
          before: old,
        });
        result.changed += 1;
        continue;
      }

      const { status, position } = computed.get(id)!;
      let approvalId = draft.approvalId;

      if (
        old?.quotaStatus === "pending" &&
        old.approvalId &&
        (status !== "pending" || approvalId !== old.approvalId)
      ) {
        cancelApproval(tx, old.approvalId, status === "within_quota" ? "released" : "changed");
        if (approvalId === old.approvalId) approvalId = null;
      }
      if (status === "pending") {
        if (!approvalId || draft.quotaStatus !== "pending") {
          approvalId = createApproval(
            tx,
            actor,
            { ...draft, teamId: agent.teamId },
            position,
            quota,
          );
          result.pendingApprovalIds.push(approvalId);
        } else {
          tx.update(col(COLLECTIONS.approvals).doc(approvalId), {
            position,
            quota,
            shiftId: draft.shiftId,
            updatedAt: serverNow(),
          });
        }
      } else if (status === "none" || status === "within_quota") {
        approvalId = null;
      }

      const finalDoc: Draft = { ...draft, quotaStatus: status, approvalId };
      const changedState = !old || old.quotaStatus !== status || old.approvalId !== approvalId;
      if (!isTarget && !changedState) continue;

      writeAssignment(tx, ref, finalDoc, !old);
      if (isTarget) {
        result.changed += 1;
        const statusNote = status === "pending" ? ` – ${QUOTA_STATUS_LABELS.pending}` : "";
        auditInTx(tx, actor, {
          action: old ? "assignment.update" : "assignment.create",
          entityType: "assignment",
          entityId: id,
          teamId: agent.teamId,
          summary: `${old ? "עודכן" : "נוסף"} שיבוץ של ${agentName(agent)} ל${formatDateWithDay(draft.date)}: ${describeEntry(catalog, draft)}${statusNote}`,
          before: old ?? null,
          after: finalDoc,
        });
      } else {
        auditInTx(tx, actor, {
          action: "assignment.quotaStatus",
          entityType: "assignment",
          entityId: id,
          teamId: agent.teamId,
          summary: `סטטוס השיבוץ של ${agentName(agent)} ל${formatDateWithDay(draft.date)} השתנה ל"${QUOTA_STATUS_LABELS[status] || "רגיל"}" בעקבות שינוי אחר בחודש`,
          before: { quotaStatus: old?.quotaStatus, approvalId: old?.approvalId },
          after: { quotaStatus: status, approvalId },
        });
      }
    }
  }
  return result;
}

function writeAssignment(tx: Transaction, ref: DocumentReference, doc: Draft, isNew: boolean) {
  const { id: _id, ...data } = doc;
  void _id;
  if (isNew) tx.set(ref, { ...data, createdAt: serverNow(), updatedAt: serverNow() });
  else tx.set(ref, { ...data, updatedAt: serverNow() }, { merge: true });
}

function createApproval(
  tx: Transaction,
  actor: Actor,
  entry: Pick<Draft, "id" | "agentId" | "teamId" | "date" | "month" | "shiftId" | "locationId">,
  position: number,
  quota: number,
): string {
  const ref = col(COLLECTIONS.approvals).doc();
  tx.set(ref, {
    type: "monthly_quota",
    assignmentId: entry.id,
    agentId: entry.agentId,
    teamId: entry.teamId,
    date: entry.date,
    month: entry.month,
    shiftId: entry.shiftId,
    locationId: entry.locationId,
    position,
    quota,
    status: "pending",
    requestedBy: actor.id,
    requestedByName: actor.fullName,
    decidedBy: null,
    decidedByName: null,
    decidedAt: null,
    decisionNote: "",
    cancelReason: null,
    createdAt: serverNow(),
    updatedAt: serverNow(),
  });
  return ref.id;
}

function cancelApproval(
  tx: Transaction,
  approvalId: string,
  reason: "deleted" | "changed" | "released",
) {
  tx.update(col(COLLECTIONS.approvals).doc(approvalId), {
    status: "cancelled",
    cancelReason: reason,
    updatedAt: serverNow(),
  });
}

/**
 * Re-runs the quota rule for an agent over the given months (e.g. after the agent's quota
 * changed). Uses no-op-safe writes; permission checks are the caller's responsibility.
 */
export async function recomputeAgentMonths(actor: Actor, agentId: string, months: IsoMonth[]) {
  const catalog = await getCatalog();
  const quotaLocations = new Set(catalog.locations.filter((l) => l.requiresQuota).map((l) => l.id));
  const pending: string[] = [];
  for (const month of months) {
    await db().runTransaction(async (tx) => {
      const settings = await getSettingsInTx(tx);
      const agentSnap = await tx.get(col(COLLECTIONS.agents).doc(agentId));
      if (!agentSnap.exists) return;
      const agent = fromDoc<Agent>(agentSnap);
      const snap = await tx.get(
        col(COLLECTIONS.assignments).where("agentId", "==", agentId).where("month", "==", month),
      );
      const entries = snap.docs.map((d) => fromDoc<Assignment>(d));
      const quota = agent.monthlyQuota ?? settings.defaultMonthlyQuota;
      const computed = computeQuotaStatuses(entries, quota, quotaLocations);
      for (const entry of entries) {
        const { status, position } = computed.get(entry.id)!;
        let approvalId = entry.approvalId;
        if (entry.quotaStatus === "pending" && entry.approvalId && status !== "pending") {
          cancelApproval(tx, entry.approvalId, "released");
          approvalId = null;
        }
        if (status === "pending" && entry.quotaStatus !== "pending") {
          approvalId = createApproval(tx, actor, entry, position, quota);
          pending.push(approvalId);
        } else if (status === "pending" && approvalId) {
          tx.update(col(COLLECTIONS.approvals).doc(approvalId), {
            position,
            quota,
            updatedAt: serverNow(),
          });
        }
        if (status === "none" || status === "within_quota") approvalId = null;
        if (status !== entry.quotaStatus || approvalId !== entry.approvalId) {
          tx.update(col(COLLECTIONS.assignments).doc(entry.id), {
            quotaStatus: status,
            approvalId,
            updatedAt: serverNow(),
          });
          auditInTx(tx, actor, {
            action: "assignment.quotaStatus",
            entityType: "assignment",
            entityId: entry.id,
            teamId: entry.teamId,
            summary: `סטטוס השיבוץ של ${agentName(agent)} ל${formatDateWithDay(entry.date)} השתנה ל"${QUOTA_STATUS_LABELS[status] || "רגיל"}" בעקבות שינוי מכסה`,
            before: { quotaStatus: entry.quotaStatus },
            after: { quotaStatus: status },
          });
        }
      }
    });
  }
  if (pending.length > 0) emit("approval.requested", { approvalIds: pending });
}

export type { QuotaStatus };
