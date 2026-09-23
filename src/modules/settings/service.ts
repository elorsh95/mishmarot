import type { Transaction } from "firebase-admin/firestore";
import { cache } from "react";
import { z } from "zod";
import { db } from "@/lib/firebase/admin";
import { col, COLLECTIONS, serverNow } from "@/lib/firebase/collections";
import { auditInTx } from "@/modules/audit/service";
import { assertCan, type Actor } from "@/modules/permissions/check";

/**
 * Global settings live in a single document. New settings get a default here,
 * so existing databases keep working without a migration.
 */
export const settingsSchema = z.object({
  /** Days per calendar month an agent may work from a quota location without approval. */
  defaultMonthlyQuota: z.coerce.number().int().min(0).max(31).default(2),
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
  await db().runTransaction(async (tx) => {
    const before = parse((await tx.get(settingsRef())).data());
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
}

export async function ensureDefaultSettings() {
  const snap = await settingsRef().get();
  if (!snap.exists) await settingsRef().set({ ...parse({}), updatedAt: serverNow() });
}
