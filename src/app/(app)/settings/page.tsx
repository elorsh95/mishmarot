import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { requireSessionUser } from "@/modules/auth/session";
import { listCalendar } from "@/modules/calendar/service";
import { getCatalog } from "@/modules/catalog/service";
import { addDays, todayIso } from "@/lib/dates";
import { can } from "@/modules/permissions/check";
import { getSettings } from "@/modules/settings/service";
import { getBranding } from "@/modules/branding/service";
import { logoUrl } from "@/modules/branding/types";
import { AbsenceTypesCard, LocationsCard, ShiftsCard } from "./catalog-lists";
import { BrandingCard } from "./branding-card";
import { GeneralSettingsCard } from "./general-settings";
import { HolidaysCard } from "./holidays-card";

export const metadata: Metadata = { title: "הגדרות" };

export default async function SettingsPage() {
  const user = await requireSessionUser();
  const canSettings = can(user, "settings.manage");
  const canCatalog = can(user, "catalog.manage");
  if (!canSettings && !canCatalog) notFound();

  const today = todayIso();
  const [settings, catalog, holidays, branding] = await Promise.all([
    canSettings ? getSettings() : null,
    canCatalog ? getCatalog() : null,
    canCatalog ? listCalendar(addDays(today, -7), addDays(today, 365)) : null,
    canSettings ? getBranding() : null,
  ]);

  return (
    <>
      <PageHeader title="הגדרות" description="הגדרות המערכת והרשימות שמשמשות בסידור העבודה" />
      <div className="space-y-5">
        {settings ? <GeneralSettingsCard settings={settings} /> : null}
        {branding ? <BrandingCard logoUrl={logoUrl(branding)} /> : null}
        {catalog ? (
          <>
            {holidays ? <HolidaysCard rows={holidays} /> : null}
            <ShiftsCard shifts={catalog.shifts} />
            <LocationsCard locations={catalog.locations} />
            <AbsenceTypesCard absenceTypes={catalog.absenceTypes} />
          </>
        ) : null}
      </div>
    </>
  );
}
