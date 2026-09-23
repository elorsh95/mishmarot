import type { Query } from "firebase-admin/firestore";
import { z } from "zod";
import { db } from "@/lib/firebase/admin";
import {
  chunk,
  col,
  COLLECTIONS,
  fromDoc,
  fromDocOrNull,
  serverNow,
} from "@/lib/firebase/collections";
import { formatDateWithDay, todayIso, type IsoDate, type IsoMonth } from "@/lib/dates";
import { DomainError, NotFoundError } from "@/lib/errors";
import { emit } from "@/lib/events";
import { agentName, type Agent } from "@/modules/agents/types";
import { auditInTx } from "@/modules/audit/service";
import { getCatalog } from "@/modules/catalog/service";
import { assertCanForTeam, teamScope, type Actor } from "@/modules/permissions/check";
import { isQuotaDay } from "@/modules/schedule/quota";
import { describeEntry } from "@/modules/schedule/rules";
import type { Assignment } from "@/modules/schedule/types";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface ApprovalRequest {
  id: string;
  type: "monthly_quota";
  assignmentId: string;
  agentId: string;
  teamId: string;
  date: IsoDate;
  month: IsoMonth;
  shiftId: string | null;
  locationId: string | null;
  /** Which counted quota day of the month this is (e.g. 3 = the third home day). */
  position: number;
  quota: number;
  status: ApprovalStatus;
  requestedBy: string;
  requestedByName: string;
  decidedBy: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNote: string;
  cancelReason: "deleted" | "changed" | "released" | null;
  createdAt: string;
}

export interface ApprovalListItem extends ApprovalRequest {
  agentName: string;
  employeeNumber: string;
  /** Other counted quota days of the agent in the same month. */
  monthQuotaDates: IsoDate[];
  /** The day has arrived and the request is still pending. */
  urgent: boolean;
}

export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  pending: "ממתין לאישור",
  approved: "אושר",
  rejected: "נדחה",
  cancelled: "בוטל",
};

export interface ApprovalFilter {
  status: "pending" | "decided";
  teamId?: string;
  month?: IsoMonth;
}

function scopedQueries(actor: Actor, base: Query, teamId?: string): Query[] | null {
  const scope = teamScope(actor, "approvals.view");
  if (teamId) {
    if (scope !== "all" && !scope.includes(teamId)) return null;
    return [base.where("teamId", "==", teamId)];
  }
  if (scope === "all") return [base];
  if (scope.length === 0) return null;
  return chunk(scope).map((ids) => base.where("teamId", "in", ids));
}

export async function listApprovals(
  actor: Actor,
  filter: ApprovalFilter,
): Promise<ApprovalListItem[]> {
  const today = todayIso();
  let base: Query = col(COLLECTIONS.approvals);
  if (filter.month) base = base.where("month", "==", filter.month);
  base =
    filter.status === "pending"
      ? base.where("status", "==", "pending").orderBy("date", "asc")
      : base
          .where("status", "in", ["approved", "rejected"])
          .orderBy("decidedAt", "desc")
          .limit(300);

  const queries = scopedQueries(actor, base, filter.teamId);
  if (!queries) return [];
  const docs = (await Promise.all(queries.map((q) => q.get()))).flatMap((s) => s.docs);
  const approvals = docs.map((d) => fromDoc<ApprovalRequest>(d));
  if (approvals.length === 0) return [];

  const agentIds = [...new Set(approvals.map((a) => a.agentId))];
  const agentSnaps = await db().getAll(...agentIds.map((id) => col(COLLECTIONS.agents).doc(id)));
  const agents = new Map(agentSnaps.filter((s) => s.exists).map((s) => [s.id, fromDoc<Agent>(s)]));

  // Quota days per agent-month, for the "already this month" column.
  const catalog = await getCatalog();
  const quotaLocations = new Set(catalog.locations.filter((l) => l.requiresQuota).map((l) => l.id));
  const monthKeys = [...new Set(approvals.map((a) => `${a.agentId}|${a.month}`))];
  const monthDates = new Map<string, IsoDate[]>();
  await Promise.all(
    monthKeys.map(async (key) => {
      const [agentId, month] = key.split("|");
      const snap = await col(COLLECTIONS.assignments)
        .where("agentId", "==", agentId)
        .where("month", "==", month)
        .get();
      const dates = snap.docs
        .map((d) => fromDoc<Assignment>(d))
        .filter((a) => isQuotaDay(a, quotaLocations) && a.quotaStatus !== "rejected")
        .map((a) => a.date)
        .sort();
      monthDates.set(key, dates);
    }),
  );

  const items = approvals.map((a) => {
    const agent = agents.get(a.agentId);
    return {
      ...a,
      agentName: agent ? agentName(agent) : "נציג שנמחק",
      employeeNumber: agent?.employeeNumber ?? "",
      monthQuotaDates: monthDates.get(`${a.agentId}|${a.month}`) ?? [],
      urgent: a.status === "pending" && a.date <= today,
    };
  });
  return filter.status === "pending"
    ? items.sort((a, b) => Number(b.urgent) - Number(a.urgent) || a.date.localeCompare(b.date))
    : items.sort((a, b) => (b.decidedAt ?? "").localeCompare(a.decidedAt ?? ""));
}

export async function countPendingApprovals(
  actor: Actor,
): Promise<{ pending: number; urgent: number }> {
  const queries = scopedQueries(actor, col(COLLECTIONS.approvals).where("status", "==", "pending"));
  if (!queries) return { pending: 0, urgent: 0 };
  const today = todayIso();
  const docs = (await Promise.all(queries.map((q) => q.select("date").get()))).flatMap(
    (s) => s.docs,
  );
  return {
    pending: docs.length,
    urgent: docs.filter((d) => String(d.get("date")) <= today).length,
  };
}

export const decisionSchema = z
  .object({
    approvalId: z.string().min(1),
    decision: z.enum(["approved", "rejected"]),
    note: z.string().trim().max(500).default(""),
  })
  .refine((d) => d.decision === "approved" || d.note.length > 0, {
    message: "יש לכתוב הערה בעת דחייה",
    path: ["note"],
  });

export async function decideApproval(actor: Actor, input: z.input<typeof decisionSchema>) {
  const { approvalId, decision, note } = decisionSchema.parse(input);
  const catalog = await getCatalog();
  const stale = await db().runTransaction(async (tx) => {
    const approvalRef = col(COLLECTIONS.approvals).doc(approvalId);
    const approval = fromDocOrNull<ApprovalRequest>(await tx.get(approvalRef));
    if (!approval) throw new NotFoundError("הבקשה לא נמצאה");
    assertCanForTeam(actor, "approvals.decide", approval.teamId);
    if (approval.status !== "pending") throw new DomainError("הבקשה כבר טופלה");

    const assignmentRef = col(COLLECTIONS.assignments).doc(approval.assignmentId);
    const assignment = fromDocOrNull<Assignment>(await tx.get(assignmentRef));
    const agentSnap = await tx.get(col(COLLECTIONS.agents).doc(approval.agentId));
    if (
      !assignment ||
      assignment.approvalId !== approvalId ||
      assignment.quotaStatus !== "pending"
    ) {
      tx.update(approvalRef, {
        status: "cancelled",
        cancelReason: "changed",
        updatedAt: serverNow(),
      });
      return true;
    }

    tx.update(approvalRef, {
      status: decision,
      decidedBy: actor.id,
      decidedByName: actor.fullName,
      decidedAt: serverNow(),
      decisionNote: note,
      updatedAt: serverNow(),
    });
    tx.update(assignmentRef, { quotaStatus: decision, updatedAt: serverNow() });

    const name = agentSnap.exists ? agentName(fromDoc<Agent>(agentSnap)) : "נציג";
    const verb = decision === "approved" ? "אושר" : "נדחה";
    auditInTx(tx, actor, {
      action: decision === "approved" ? "approval.approve" : "approval.reject",
      entityType: "approval",
      entityId: approvalId,
      teamId: approval.teamId,
      summary: `${verb} שיבוץ חריג של ${name} ל${formatDateWithDay(approval.date)} (${describeEntry(catalog, assignment)})${note ? `: ${note}` : ""}`,
      before: { status: "pending" },
      after: { status: decision, note },
    });
    return false;
  });
  // Thrown after commit so the cancellation above is saved.
  if (stale) throw new DomainError("השיבוץ השתנה מאז שנשלחה הבקשה. הבקשה בוטלה");
  emit("approval.decided", { approvalId, status: decision });
}

/** Approves several requests; returns the ones that failed with the reason. */
export async function approveMany(actor: Actor, approvalIds: string[]) {
  const failed: Array<{ approvalId: string; error: string }> = [];
  for (const approvalId of approvalIds) {
    try {
      await decideApproval(actor, { approvalId, decision: "approved" });
    } catch (err) {
      failed.push({
        approvalId,
        error: err instanceof DomainError ? err.message : "שגיאה לא צפויה",
      });
    }
  }
  return { approved: approvalIds.length - failed.length, failed };
}
