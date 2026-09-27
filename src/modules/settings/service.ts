import type { Transaction } from "firebase-admin/firestore";
import { cache } from "react";
import { z } from "zod";
import { db } from "@/lib/firebase/admin";
import { col, COLLECTIONS, serverNow } from "@/lib/firebase/collections";
import { auditInTx } from "@/modules/audit/service";
import { todayIso } from "@/lib/dates";
import { assertCan, type Actor } from "@/modules/permissions/check";

/**
 * Global settings live in a single document. New settings get a default here,
 * so existing databases keep working without a migration.
 */
export const settingsSchema = z.object({
  /** Days per quota period an agent may work from a quota location without approval. */
  defaultMonthlyQuota: z.coerce.number().int().min(0).max(31).default(2),
  /** Whether the quota counts per week or per calendar month. */
  quotaPeriod: z.enum(["week", "month"]).default("month"),
});

export type Settings = z.infer<typeof settingsSchema>;

const settingsRef = () => col(COLLECTIONS.settings).doc("general");

function parse(data: unknown): Settings {
  return settingsSchema.parse(data ?? {});
}

export const getSettings = cache(async (): Promise<Settings> => {
  return parse((await settingsRef().get()).data());
});

export async function getSettingsInTx(tx: Transaction): Promise<Settings> {
  return parse((await tx.get(settingsRef())).data());
}

export async function updateSettings(actor: Actor, input: z.input<typeof settingsSchema>) {
  assertCan(actor, "settings.manage");
  const next = settingsSchema.parse(input);
  let before: Settings | null = null;
  await db().runTransaction(async (tx) => {
    before = parse((await tx.get(settingsRef())).data());
    tx.set(
      settingsRef(),
      { ...next, updatedAt: serverNow(), updatedBy: actor.id },
      { merge: true },
    );
    auditInTx(tx, actor, {
      action: "settings.update",
      entityType: "settings",
      entityId: "general",
      summary: "עודכנו הגדרות המערכת",
      before,
      after: next,
    });
  });
  const prev = before as Settings | null;
  if (
    prev &&
    (prev.quotaPeriod !== next.quotaPeriod || prev.defaultMonthlyQuota !== next.defaultMonthlyQuota)
  ) {
    // The quota rule changed: re-run it for the current period and later ones, so pending
    // requests and statuses match the new rule. Past periods are left as they were decided.
    // Imported lazily: the schedule engine itself reads the settings.
    const { recomputeAllQuotas } = await import("@/modules/schedule/engine");
    await recomputeAllQuotas(actor, todayIso());
  }
}

export async function ensureDefaultSettings() {
  const snap = await settingsRef().get();
  if (!snap.exists) await settingsRef().set({ ...parse({}), updatedAt: serverNow() });
}
