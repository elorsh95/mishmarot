import { db } from "@/lib/firebase/admin";
import { col, COLLECTIONS } from "@/lib/firebase/collections";
import { DomainError } from "@/lib/errors";
import type { Actor } from "@/modules/permissions/check";
import { applyChanges, noChanges, type ApplyResult, type SkippedOp } from "./engine";
import { assignmentId, entryOf, type Assignment, type CellChange, type EntryInput } from "./types";

/** How long a bulk action can be undone. */
export const UNDO_WINDOW_MS = 15 * 60 * 1000;

/**
 * Keeps what a bulk action changed, so its author can put the cells back for a few minutes.
 * Each user has one slot (their last bulk action), so nothing piles up. Returns a token for
 * the undo button, or null when nothing changed.
 */
export async function saveUndo(actor: Actor, result: ApplyResult): Promise<string | null> {
  if (result.changes.length === 0) return null;
  const token = col(COLLECTIONS.undoBatches).doc().id;
  await col(COLLECTIONS.undoBatches).doc(actor.id).set({
    token,
    changes: result.changes,
    createdAt: Date.now(),
  });
  return token;
}

function same(a: EntryInput | null, b: EntryInput | null): boolean {
  if (!a || !b) return !a && !b;
  if (a.kind !== b.kind || (a.note ?? "") !== (b.note ?? "")) return false;
  return a.kind === "shift" && b.kind === "shift"
    ? a.shiftId === b.shiftId && a.locationId === b.locationId
    : a.kind === "absence" && b.kind === "absence" && a.absenceTypeId === b.absenceTypeId;
}

/**
 * Restores the cells a bulk action changed. Cells changed again since are left alone and
 * reported. The restore itself goes through applyChanges (permissions, locks, quota, audit);
 * a home day that had been approved comes back as a new request.
 */
export async function undoBatch(actor: Actor, token: string): Promise<ApplyResult> {
  const ref = col(COLLECTIONS.undoBatches).doc(actor.id);
  const snap = await ref.get();
  if (!snap.exists || snap.get("token") !== token) {
    throw new DomainError("אפשר לבטל רק את הפעולה הגורפת האחרונה");
  }
  if (Date.now() - Number(snap.get("createdAt")) > UNDO_WINDOW_MS) {
    await ref.delete();
    throw new DomainError("עבר יותר מדי זמן מאז הפעולה, ואי אפשר לבטל אותה");
  }
  const changes = snap.get("changes") as CellChange[];
  // One undo per action. A transaction makes a double click restore only once.
  const claimed = await db().runTransaction(async (tx) => {
    const fresh = await tx.get(ref);
    if (!fresh.exists || fresh.get("token") !== token) return false;
    tx.delete(ref);
    return true;
  });
  if (!claimed) throw new DomainError("הפעולה כבר בוטלה");

  const current = await db().getAll(
    ...changes.map((c) => col(COLLECTIONS.assignments).doc(assignmentId(c.agentId, c.date))),
  );
  const skipped: SkippedOp[] = [];
  const ops = changes.flatMap((c, i) => {
    const now = current[i].exists ? entryOf(current[i].data() as Assignment) : null;
    if (!same(now, c.after)) {
      skipped.push({
        agentId: c.agentId,
        date: c.date,
        reason: "המשבצת שונתה מאז, ולכן לא שוחזרה",
      });
      return [];
    }
    return [{ agentId: c.agentId, date: c.date, entry: c.before }];
  });
  const result = ops.length ? await applyChanges(actor, ops, { mode: "bulk" }) : noChanges();
  return { ...result, skipped: [...skipped, ...result.skipped] };
}
