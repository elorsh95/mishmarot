import { col, COLLECTIONS, fromDoc, serverNow } from "@/lib/firebase/collections";
import { logError } from "@/lib/error-report";
import { SeenRecently } from "@/lib/rate-limit";
import { assertCan, teamScope, type Actor } from "@/modules/permissions/check";
import type { AccessAction, AccessEntry } from "./types";

/**
 * The access log (accessLogs), apart from the audit log of changes: views of personal data,
 * exports and printing, and refused access. A view of the same thing by the same user is
 * logged once per 10 minutes, so reloading or auto-refresh doesn't flood it.
 */

const VIEW_DEDUP_MS = 10 * 60_000;
const recentViews = new SeenRecently(VIEW_DEDUP_MS, 20_000);

export interface AccessInput {
  action: AccessAction;
  resource: string;
  detail: string;
  teamId?: string | null;
}

/** Writes an access entry. Never throws: a logging failure must not block the page. */
export async function logAccess(actor: Pick<Actor, "id" | "fullName"> | null, input: AccessInput) {
  if (input.action === "view") {
    const key = `${actor?.id}|${input.resource}|${input.detail}`;
    if (recentViews.check(key)) return;
  }
  try {
    await col(COLLECTIONS.accessLogs).add({
      actorId: actor?.id ?? null,
      actorName: actor?.fullName ?? "לא מחובר",
      action: input.action,
      resource: input.resource,
      detail: input.detail.slice(0, 300),
      teamId: input.teamId ?? null,
      createdAt: serverNow(),
    });
  } catch (err) {
    logError(err, { source: "access-log", userId: actor?.id ?? null });
  }
}

export async function listAccess(
  actor: Actor,
  { action, limit = 200 }: { action?: AccessAction; limit?: number } = {},
): Promise<AccessEntry[]> {
  assertCan(actor, "audit.view");
  const scope = teamScope(actor, "audit.view");
  let query = col(COLLECTIONS.accessLogs).orderBy("createdAt", "desc");
  if (action) query = query.where("action", "==", action);
  // Team managers see only entries about their teams, so read more and filter.
  const snap = await query.limit(scope === "all" ? limit : limit * 5).get();
  return snap.docs
    .map((d) => fromDoc<AccessEntry>(d))
    .filter((e) => scope === "all" || (e.teamId !== null && scope.includes(e.teamId)))
    .slice(0, limit);
}
