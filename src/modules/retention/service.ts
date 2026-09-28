import { Timestamp, type Query } from "firebase-admin/firestore";
import { z } from "zod";
import { db } from "@/lib/firebase/admin";
import { col, COLLECTIONS, serverNow } from "@/lib/firebase/collections";
import { addMonths, monthOf, todayIso, type IsoDate } from "@/lib/dates";
import { audit, auditInTx } from "@/modules/audit/service";
import { assertCan, type Actor } from "@/modules/permissions/check";
import {
  DEFAULT_RETENTION,
  RESULT_LABELS,
  RETENTION_LIMITS,
  type RetentionResult,
  type RetentionSettings,
} from "./types";

/**
 * Data retention: old logs, attendance and schedule history are deleted, and agents who left
 * long ago have their personal details erased. Runs daily from GitHub Actions
 * (npm run retention) and can be previewed or run from Settings → אבטחה.
 */

const settingsRef = () => col(COLLECTIONS.settings).doc("retention");

const months = (key: keyof RetentionSettings) =>
  z.coerce
    .number()
    .int()
    .min(RETENTION_LIMITS[key].min, `לפחות ${RETENTION_LIMITS[key].min} חודשים`)
    .max(RETENTION_LIMITS[key].max)
    .default(DEFAULT_RETENTION[key]);

export const retentionSchema = z.object({
  auditMonths: months("auditMonths"),
  accessMonths: months("accessMonths"),
  attendanceMonths: months("attendanceMonths"),
  scheduleMonths: months("scheduleMonths"),
  formerAgentMonths: months("formerAgentMonths"),
});

export interface RetentionState extends RetentionSettings {
  lastRunAt: string | null;
  lastResult: RetentionResult | null;
}

export async function getRetention(): Promise<RetentionState> {
  const data = (await settingsRef().get()).data() ?? {};
  const parsed = retentionSchema.safeParse(data);
  return {
    ...(parsed.success ? parsed.data : DEFAULT_RETENTION),
    lastRunAt: data.lastRunAt ? (data.lastRunAt as Timestamp).toDate().toISOString() : null,
    lastResult: (data.lastResult as RetentionResult | undefined) ?? null,
  };
}

export async function updateRetention(actor: Actor, input: z.input<typeof retentionSchema>) {
  assertCan(actor, "settings.manage");
  const next = retentionSchema.parse(input);
  await db().runTransaction(async (tx) => {
    const before = (await tx.get(settingsRef())).data() ?? null;
    tx.set(
      settingsRef(),
      { ...next, updatedAt: serverNow(), updatedBy: actor.id },
      { merge: true },
    );
    auditInTx(tx, actor, {
      action: "settings.retention",
      entityType: "settings",
      entityId: "retention",
      summary: "עודכנה מדיניות שמירת המידע",
      before: before ? retentionSchema.parse(before) : null,
      after: next,
    });
  });
}

/** The first day that is kept: everything before it goes. */
export function cutoffDate(today: IsoDate, keepMonths: number): IsoDate {
  return `${addMonths(monthOf(today), -keepMonths)}-${today.slice(8, 10)}`.replace(
    /-(29|30|31)$/,
    "-28",
  );
}

/** Deletes (or, on a dry run, counts) everything a query matches, in batches. */
async function purge(query: Query, dryRun: boolean): Promise<number> {
  if (dryRun) return (await query.count().get()).data().count;
  let total = 0;
  for (;;) {
    const snap = await query.limit(400).get();
    if (snap.empty) return total;
    const batch = db().batch();
    for (const d of snap.docs) batch.delete(d.ref);
    await batch.commit();
    total += snap.size;
  }
}

async function eraseFormerAgents(cutoff: Date, dryRun: boolean): Promise<number> {
  const snap = await col(COLLECTIONS.agents).where("isActive", "==", false).get();
  const due = snap.docs.filter((d) => {
    if (d.get("anonymizedAt")) return false;
    const updated = d.get("updatedAt") as Timestamp | undefined;
    return updated ? updated.toDate() < cutoff : true;
  });
  if (!dryRun) {
    for (let i = 0; i < due.length; i += 400) {
      const batch = db().batch();
      for (const d of due.slice(i, i + 400)) {
        batch.update(d.ref, {
          firstName: "נציג/ה לשעבר",
          lastName: d.id.slice(0, 6),
          employeeNumber: "",
          notes: "",
          anonymizedAt: serverNow(),
        });
      }
      await batch.commit();
    }
  }
  return due.length;
}

/** Applies the retention policy. `actor` is null when run by the daily job. */
export async function runRetention(
  actor: Actor | null,
  { dryRun = false, now = new Date() }: { dryRun?: boolean; now?: Date } = {},
): Promise<RetentionResult> {
  if (actor) assertCan(actor, "settings.manage");
  const policy = await getRetention();
  const today = todayIso(now);
  const tsBefore = (keep: number) =>
    Timestamp.fromDate(new Date(`${cutoffDate(today, keep)}T00:00:00Z`));
  const scheduleCutoff = cutoffDate(today, policy.scheduleMonths);

  const result: RetentionResult = {
    auditLogs: await purge(
      col(COLLECTIONS.auditLogs).where("createdAt", "<", tsBefore(policy.auditMonths)),
      dryRun,
    ),
    accessLogs: await purge(
      col(COLLECTIONS.accessLogs).where("createdAt", "<", tsBefore(policy.accessMonths)),
      dryRun,
    ),
    attendance: await purge(
      col(COLLECTIONS.attendance).where("date", "<", cutoffDate(today, policy.attendanceMonths)),
      dryRun,
    ),
    assignments: await purge(
      col(COLLECTIONS.assignments).where("date", "<", scheduleCutoff),
      dryRun,
    ),
    approvals: await purge(col(COLLECTIONS.approvals).where("date", "<", scheduleCutoff), dryRun),
    weeks: await purge(col(COLLECTIONS.weeks).where("weekStart", "<", scheduleCutoff), dryRun),
    formerAgents: await eraseFormerAgents(
      new Date(`${cutoffDate(today, policy.formerAgentMonths)}T00:00:00Z`),
      dryRun,
    ),
    loginChallenges: await purge(
      col(COLLECTIONS.mfaChallenges).where("expiresAt", "<", now.getTime()),
      dryRun,
    ),
  };

  if (!dryRun) {
    const done = (Object.keys(result) as Array<keyof RetentionResult>).filter((k) => result[k]);
    await settingsRef().set({ lastRunAt: serverNow(), lastResult: result }, { merge: true });
    await audit(actor, {
      action: "retention.run",
      entityType: "settings",
      entityId: "retention",
      summary: done.length
        ? `מדיניות שמירת המידע: נמחקו ${done.map((k) => `${result[k]} ${RESULT_LABELS[k]}`).join(", ")}`
        : "מדיניות שמירת המידע: לא היה מה למחוק",
      after: result,
    });
  }
  return result;
}
