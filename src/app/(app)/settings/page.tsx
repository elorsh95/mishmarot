import { deniedPage } from "@/modules/access/pages";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/cn";
import { requireSessionUser } from "@/modules/auth/session";
import { getBranding } from "@/modules/branding/service";
import { logoUrl } from "@/modules/branding/types";
import { listCalendar } from "@/modules/calendar/service";
import { getCatalog, listAttendanceStatuses } from "@/modules/catalog/service";
import { addDays, todayIso } from "@/lib/dates";
import { can } from "@/modules/permissions/check";
import { getRetention } from "@/modules/retention/service";
import { countUsersWithoutMfa, getSecuritySettings } from "@/modules/security/service";
import { getSettings } from "@/modules/settings/service";
import {
  AbsenceTypesCard,
  AttendanceStatusesCard,
  LocationsCard,
  ShiftsCard,
} from "./catalog-lists";
import { BrandingCard } from "./branding-card";
import { GeneralSettingsCard } from "./general-settings";
import { HolidaysCard } from "./holidays-card";
import { RetentionCard } from "./retention-card";
import { SecuritySettingsCard } from "./security-card";

export const metadata: Metadata = { title: "הגדרות" };

const TABS = [
  { key: "general", label: "כללי", needs: "settings.manage" },
  { key: "security", label: "אבטחה", needs: "settings.manage" },
  { key: "holidays", label: "חגים וימים מיוחדים", needs: "catalog.manage" },
  { key: "shifts", label: "משמרות", needs: "catalog.manage" },
  { key: "locations", label: "מיקומי עבודה", needs: "catalog.manage" },
  { key: "absences", label: "סוגי היעדרות", needs: "catalog.manage" },
  { key: "attendance", label: "סטטוסי נוכחות", needs: "catalog.manage" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/** One tab at a time (?tab=), so each loads only its own data. */
export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const user = await requireSessionUser();
  const tabs = TABS.filter((t) => can(user, t.needs));
  if (tabs.length === 0) await deniedPage(user, "הגדרות");
  const { tab: tabParam } = await searchParams;
  const tab: TabKey = tabs.find((t) => t.key === tabParam)?.key ?? tabs[0].key;

  let content: React.ReactNode;
  if (tab === "general") {
    const [settings, branding] = await Promise.all([getSettings(), getBranding()]);
    content = (
      <>
        <GeneralSettingsCard settings={settings} />
        <BrandingCard logoUrl={logoUrl(branding)} />
      </>
    );
  } else if (tab === "security") {
    const [security, withoutMfa, retention] = await Promise.all([
      getSecuritySettings(),
      countUsersWithoutMfa(user),
      getRetention(),
    ]);
    const { lastRunAt, lastResult, ...policy } = retention;
    content = (
      <>
        <SecuritySettingsCard settings={security} usersWithoutMfa={withoutMfa} />
        <RetentionCard settings={policy} lastRunAt={lastRunAt} lastResult={lastResult} />
      </>
    );
  } else if (tab === "holidays") {
    const today = todayIso();
    content = <HolidaysCard rows={await listCalendar(addDays(today, -7), addDays(today, 365))} />;
  } else if (tab === "attendance") {
    content = <AttendanceStatusesCard statuses={await listAttendanceStatuses()} />;
  } else {
    const catalog = await getCatalog();
    content =
      tab === "shifts" ? (
        <ShiftsCard shifts={catalog.shifts} />
      ) : tab === "locations" ? (
        <LocationsCard locations={catalog.locations} />
      ) : (
        <AbsenceTypesCard absenceTypes={catalog.absenceTypes} />
      );
  }

  return (
    <>
      <PageHeader title="הגדרות" description="הגדרות המערכת והרשימות שמשמשות בסידור העבודה" />
      {tabs.length > 1 ? (
        <nav
          aria-label="לשוניות הגדרות"
          className="-mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0"
        >
          <div className="inline-flex min-w-max rounded-lg bg-muted p-1">
            {tabs.map((t) => (
              <Link
                key={t.key}
                href={`/settings?tab=${t.key}`}
                aria-current={t.key === tab ? "page" : undefined}
                className={cn(
                  "rounded-md px-3.5 py-1.5 text-sm font-medium whitespace-nowrap",
                  t.key === tab ? "bg-surface shadow-sm" : "text-fg-muted hover:text-fg",
                )}
              >
                {t.label}
              </Link>
            ))}
          </div>
        </nav>
      ) : null}
      <div className="space-y-5">{content}</div>
    </>
  );
}
