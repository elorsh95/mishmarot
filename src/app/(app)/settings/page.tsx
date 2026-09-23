import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { requireSessionUser } from "@/modules/auth/session";
import { getCatalog } from "@/modules/catalog/service";
import { can } from "@/modules/permissions/check";
import { getSettings } from "@/modules/settings/service";
import { AbsenceTypesCard, LocationsCard, ShiftsCard } from "./catalog-lists";
import { GeneralSettingsCard } from "./general-settings";

export const metadata: Metadata = { title: "הגדרות" };

export default async function SettingsPage() {
  const user = await requireSessionUser();
  const canSettings = can(user, "settings.manage");
  const canCatalog = can(user, "catalog.manage");
  if (!canSettings && !canCatalog) notFound();

  const [settings, catalog] = await Promise.all([
    canSettings ? getSettings() : null,
    canCatalog ? getCatalog() : null,
  ]);

  return (
    <>
      <PageHeader title="הגדרות" description="הגדרות המערכת והרשימות שמשמשות בסידור העבודה" />
      <div className="space-y-5">
        {settings ? <GeneralSettingsCard settings={settings} /> : null}
        {catalog ? (
          <>
            <ShiftsCard shifts={catalog.shifts} />
            <LocationsCard locations={catalog.locations} />
            <AbsenceTypesCard absenceTypes={catalog.absenceTypes} />
          </>
        ) : null}
      </div>
    </>
  );
}
