import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, formatDayMonth, WEEKDAY_NAMES, weekdayOf } from "@/lib/dates";
import { getBranding } from "@/modules/branding/service";
import { logoUrl } from "@/modules/branding/types";
import { getSharedWeek } from "@/modules/sharing/service";
import { SharedSchedule } from "./shared-schedule";

export const metadata: Metadata = {
  title: "סידור עבודה",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * Public, read-only schedule behind a share link: no login, no editing, published weeks only.
 * Anyone with the link can view it until the team manager replaces or revokes it.
 */
export default async function SharedSchedulePage({
  params,
  searchParams,
}: PageProps<"/s/[token]">) {
  const { token } = await params;
  const { week } = await searchParams;
  const [data, branding] = await Promise.all([
    getSharedWeek(token, typeof week === "string" ? week : undefined),
    getBranding(),
  ]);
  const logo = logoUrl(branding);

  if (!data) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-2 p-6 text-center">
        <h1 className="text-xl font-bold">הקישור אינו פעיל</h1>
        <p className="text-fg-muted">ייתכן שהוחלף בקישור חדש. בקשו ממנהל הצוות את הקישור העדכני.</p>
      </main>
    );
  }

  const nav = (delta: number) => `/s/${token}?week=${addDays(data.weekStart, delta)}`;
  return (
    <main className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- a small, user-uploaded image
            <img src={logo} alt="לוגו" className="h-10 max-w-32 object-contain" />
          ) : null}
          <div>
            <h1 className="text-xl font-bold sm:text-2xl">סידור עבודה · {data.teamName}</h1>
            <p className="text-sm text-fg-muted">צפייה בלבד</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Link
            href={nav(-7)}
            aria-label="שבוע קודם"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface hover:bg-muted"
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
          <span className="min-w-40 text-center text-sm font-semibold">{data.label}</span>
          <Link
            href={nav(7)}
            aria-label="שבוע הבא"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface hover:bg-muted"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
        </div>
      </header>

      {data.published ? (
        <SharedSchedule
          data={data}
          logoUrl={logo}
          dayLabels={data.days.map((d) => ({
            date: d,
            title: `${WEEKDAY_NAMES[weekdayOf(d)]} ${formatDayMonth(d)}`,
          }))}
        />
      ) : (
        <p className="rounded-xl border border-border bg-surface p-6 text-center text-fg-muted">
          הסידור לשבוע זה עדיין לא פורסם.
        </p>
      )}
    </main>
  );
}
