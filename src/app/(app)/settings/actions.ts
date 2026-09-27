"use server";

import { z } from "zod";
import { runAction } from "@/lib/action";
import {
  absenceTypeInputSchema,
  attendanceStatusInputSchema,
  locationInputSchema,
  saveAbsenceType,
  saveAttendanceStatus,
  saveLocation,
  saveShift,
  shiftInputSchema,
} from "@/modules/catalog/service";
import { clearSpecialDay, setSpecialDay, specialDaySchema } from "@/modules/calendar/service";
import { removeLogo, setLogo } from "@/modules/branding/service";
import { settingsSchema, updateSettings } from "@/modules/settings/service";

const REVALIDATE = ["/settings", "/schedule", "/agents", "/approvals", "/attendance", "/"];
const optionalId = z.string().min(1).nullable();

export async function updateSettingsAction(input: unknown) {
  return runAction((actor) => updateSettings(actor, settingsSchema.parse(input)), {
    revalidate: REVALIDATE,
    message: "ההגדרות נשמרו",
  });
}

export async function saveShiftAction(id: string | null, input: unknown) {
  return runAction(
    (actor) => saveShift(actor, optionalId.parse(id), shiftInputSchema.parse(input)),
    {
      revalidate: REVALIDATE,
      message: "המשמרת נשמרה",
    },
  );
}

export async function saveLocationAction(id: string | null, input: unknown) {
  return runAction(
    (actor) => saveLocation(actor, optionalId.parse(id), locationInputSchema.parse(input)),
    { revalidate: REVALIDATE, message: "מיקום העבודה נשמר" },
  );
}

export async function saveAbsenceTypeAction(id: string | null, input: unknown) {
  return runAction(
    (actor) => saveAbsenceType(actor, optionalId.parse(id), absenceTypeInputSchema.parse(input)),
    { revalidate: REVALIDATE, message: "סוג ההיעדרות נשמר" },
  );
}

export async function saveAttendanceStatusAction(id: string | null, input: unknown) {
  return runAction(
    (actor) =>
      saveAttendanceStatus(actor, optionalId.parse(id), attendanceStatusInputSchema.parse(input)),
    { revalidate: REVALIDATE, message: "סטטוס הנוכחות נשמר" },
  );
}

export async function setSpecialDayAction(input: unknown) {
  return runAction((actor) => setSpecialDay(actor, specialDaySchema.parse(input)), {
    revalidate: REVALIDATE,
    message: "היום עודכן",
  });
}

export async function clearSpecialDayAction(date: string) {
  return runAction((actor) => clearSpecialDay(actor, z.string().min(1).parse(date)), {
    revalidate: REVALIDATE,
    message: "היום חזר להגדרת לוח השנה",
  });
}

/** Every page shows the logo (menu, login, print, shared schedules): the root layout covers all. */
const BRANDING_REVALIDATE = ["/"];

export async function setLogoAction(dataUrl: unknown) {
  return runAction((actor) => setLogo(actor, z.string().max(1_000_000).parse(dataUrl)), {
    revalidate: BRANDING_REVALIDATE,
    message: "הלוגו נשמר",
  });
}

export async function removeLogoAction() {
  return runAction((actor) => removeLogo(actor), {
    revalidate: BRANDING_REVALIDATE,
    message: "הלוגו הוסר",
  });
}
