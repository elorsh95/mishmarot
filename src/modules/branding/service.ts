import { cache } from "react";
import { db } from "@/lib/firebase/admin";
import { col, COLLECTIONS, serverNow } from "@/lib/firebase/collections";
import { DomainError } from "@/lib/errors";
import { auditInTx } from "@/modules/audit/service";
import { assertCan, type Actor } from "@/modules/permissions/check";
import { LOGO_MAX_BYTES, type Branding } from "./types";

/**
 * The company logo lives in its own settings document, so reading the general settings
 * doesn't load the image. Pages read only the version; the image is served by /branding/logo.
 */
const brandingRef = () => col(COLLECTIONS.settings).doc("branding");

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export const getBranding = cache(async (): Promise<Branding> => {
  const snap = await brandingRef().get();
  return { logoVersion: (snap.get("logoVersion") as string | undefined) ?? null };
});

export async function getLogo(): Promise<{ bytes: Buffer; version: string } | null> {
  const snap = await brandingRef().get();
  const data = snap.get("logoPng") as string | undefined;
  const version = snap.get("logoVersion") as string | undefined;
  return data && version ? { bytes: Buffer.from(data, "base64"), version } : null;
}

/** Sets the logo from a data: URL of a PNG. */
export async function setLogo(actor: Actor, dataUrl: string) {
  assertCan(actor, "settings.manage");
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new DomainError("יש להעלות תמונה");
  const bytes = Buffer.from(match[1], "base64");
  if (!PNG_SIGNATURE.every((b, i) => bytes[i] === b))
    throw new DomainError("הקובץ אינו תמונה תקינה");
  if (bytes.length > LOGO_MAX_BYTES) throw new DomainError("הלוגו גדול מדי. נסו תמונה קטנה יותר");
  const version = Date.now().toString(36);
  await db().runTransaction(async (tx) => {
    tx.set(brandingRef(), {
      logoPng: bytes.toString("base64"),
      logoVersion: version,
      updatedAt: serverNow(),
      updatedBy: actor.id,
    });
    auditInTx(tx, actor, {
      action: "branding.logo.set",
      entityType: "settings",
      entityId: "branding",
      summary: "הועלה לוגו החברה",
    });
  });
}

export async function removeLogo(actor: Actor) {
  assertCan(actor, "settings.manage");
  await db().runTransaction(async (tx) => {
    tx.set(brandingRef(), {
      logoPng: null,
      logoVersion: null,
      updatedAt: serverNow(),
      updatedBy: actor.id,
    });
    auditInTx(tx, actor, {
      action: "branding.logo.remove",
      entityType: "settings",
      entityId: "branding",
      summary: "הוסר לוגו החברה",
    });
  });
}
