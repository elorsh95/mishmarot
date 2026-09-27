import { randomBytes } from "node:crypto";
import { db } from "@/lib/firebase/admin";
import { col, COLLECTIONS, fromDoc, serverNow } from "@/lib/firebase/collections";
import { isIsoDate, todayIso, weekStartOf, type IsoDate } from "@/lib/dates";
import { NotFoundError } from "@/lib/errors";
import { agentName } from "@/modules/agents/types";
import { auditInTx } from "@/modules/audit/service";
import { getCatalog } from "@/modules/catalog/service";
import { assertCanForTeam, type Actor } from "@/modules/permissions/check";
import { getWeekView } from "@/modules/schedule/service";
import { assignmentId, QUOTA_STATUS_LABELS } from "@/modules/schedule/types";
import { getTeam } from "@/modules/teams/service";
import type { ShareLink, SharedWeek } from "./types";

/**
 * Each team has at most one active share link. The token is the document id: 32 random bytes,
 * so links can't be guessed. Replacing or revoking a link stops the old one immediately.
 * Managing links needs schedule.publish, since the link shows what is published.
 */

type StoredLink = ShareLink & { revokedAt: string | null };

async function activeLink(teamId: string): Promise<StoredLink | null> {
  const snap = await col(COLLECTIONS.shareLinks)
    .where("teamId", "==", teamId)
    .where("revokedAt", "==", null)
    .limit(1)
    .get();
  return snap.empty ? null : { ...fromDoc<StoredLink>(snap.docs[0]), token: snap.docs[0].id };
}

export async function getShareLink(actor: Actor, teamId: string): Promise<ShareLink | null> {
  assertCanForTeam(actor, "schedule.publish", teamId);
  const link = await activeLink(teamId);
  return link
    ? { token: link.token, teamId, createdByName: link.createdByName, createdAt: link.createdAt }
    : null;
}

/** Creates a new link for the team, revoking the previous one. */
export async function createShareLink(actor: Actor, teamId: string): Promise<ShareLink> {
  assertCanForTeam(actor, "schedule.publish", teamId);
  const team = await getTeam(teamId);
  if (!team) throw new NotFoundError("הצוות לא נמצא");
  const previous = await activeLink(teamId);
  const token = randomBytes(32).toString("base64url");
  await db().runTransaction(async (tx) => {
    if (previous) {
      tx.update(col(COLLECTIONS.shareLinks).doc(previous.token), { revokedAt: serverNow() });
    }
    tx.set(col(COLLECTIONS.shareLinks).doc(token), {
      teamId,
      createdBy: actor.id,
      createdByName: actor.fullName,
      createdAt: serverNow(),
      revokedAt: null,
    });
    auditInTx(tx, actor, {
      action: "shareLink.create",
      entityType: "shareLink",
      entityId: teamId,
      teamId,
      summary: previous
        ? `נוצר קישור שיתוף חדש לסידור של צוות ${team.name} (הקישור הקודם בוטל)`
        : `נוצר קישור שיתוף לסידור של צוות ${team.name}`,
    });
  });
  return { token, teamId, createdByName: actor.fullName, createdAt: new Date().toISOString() };
}

export async function revokeShareLink(actor: Actor, teamId: string) {
  assertCanForTeam(actor, "schedule.publish", teamId);
  const link = await activeLink(teamId);
  if (!link) return;
  const team = await getTeam(teamId);
  await db().runTransaction(async (tx) => {
    tx.update(col(COLLECTIONS.shareLinks).doc(link.token), { revokedAt: serverNow() });
    auditInTx(tx, actor, {
      action: "shareLink.revoke",
      entityType: "shareLink",
      entityId: teamId,
      teamId,
      summary: `בוטל קישור השיתוף לסידור של צוות ${team?.name ?? ""}`,
    });
  });
}

/** Read-only access to one team's schedule, used to build the shared page. */
function linkActor(teamId: string): Actor {
  return {
    id: "share-link",
    fullName: "קישור שיתוף",
    roleId: "share-link",
    permissions: { "schedule.view": "own_teams" },
    managedTeamIds: [teamId],
  };
}

/**
 * The public page's data. Returns null for an unknown or revoked link (or an inactive team).
 * Draft weeks are not shown: only what the team manager published.
 */
export async function getSharedWeek(
  token: string,
  weekInput: string | undefined,
): Promise<SharedWeek | null> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const snap = await col(COLLECTIONS.shareLinks).doc(token).get();
  if (!snap.exists || snap.get("revokedAt") !== null) return null;
  const teamId = String(snap.get("teamId"));
  const team = await getTeam(teamId);
  if (!team || !team.isActive) return null;

  const weekStart = weekStartOf(weekInput && isIsoDate(weekInput) ? weekInput : todayIso());
  const [view, catalog] = await Promise.all([
    getWeekView(linkActor(teamId), teamId, weekStart as IsoDate),
    getCatalog(),
  ]);
  const base = {
    teamName: team.name,
    weekStart: view.weekStart,
    label: view.label,
    days: view.days,
    dayInfo: view.dayInfo,
  };
  if (view.week.status !== "published") {
    return { ...base, published: false, agents: [], cells: {} };
  }

  const agents = view.agents.filter(
    (a) =>
      (a.isActive && a.inTeam) || view.days.some((d) => view.assignments[assignmentId(a.id, d)]),
  );
  const cells: SharedWeek["cells"] = {};
  for (const a of agents) {
    for (const d of view.days) {
      const e = view.assignments[assignmentId(a.id, d)];
      if (!e) continue;
      if (e.kind === "absence") {
        const type = catalog.absenceTypes.find((t) => t.id === e.absenceTypeId);
        cells[assignmentId(a.id, d)] = {
          text: type?.name ?? "היעדרות",
          sub: null,
          color: type?.color ?? "#64748b",
          absence: true,
        };
        continue;
      }
      const shift = catalog.shifts.find((s) => s.id === e.shiftId);
      const location = catalog.locations.find((l) => l.id === e.locationId);
      const status =
        e.quotaStatus === "pending" || e.quotaStatus === "rejected"
          ? ` (${QUOTA_STATUS_LABELS[e.quotaStatus]})`
          : "";
      cells[assignmentId(a.id, d)] = {
        text: shift?.name ?? "משמרת",
        sub: location ? `${location.name}${status}` : status || null,
        color: shift?.color ?? "#64748b",
        absence: false,
      };
    }
  }
  return {
    ...base,
    published: true,
    agents: agents.map((a) => ({ id: a.id, name: agentName(a) })),
    cells,
  };
}
