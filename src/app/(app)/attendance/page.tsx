import { deniedPage } from "@/modules/access/pages";
import { logAccess } from "@/modules/access/service";
import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { formatDateWithDay } from "@/lib/dates";
import { getAttendanceDay } from "@/modules/attendance/service";
import { requireSessionUser } from "@/modules/auth/session";
import { can } from "@/modules/permissions/check";
import { AttendanceBoard } from "./attendance-board";

export const metadata: Metadata = { title: "נוכחות" };

/** The shift lead's screen: today's schedule for every team, to mark who came and from where. */
export default async function AttendancePage({ searchParams }: PageProps<"/attendance">) {
  const user = await requireSessionUser();
  if (!can(user, "attendance.view")) await deniedPage(user, "נוכחות");
  const params = await searchParams;
  const date = typeof params.date === "string" ? params.date : undefined;
  const day = await getAttendanceDay(user, date);
  await logAccess(user, {
    action: "view",
    resource: "attendance",
    detail: `נוכחות · ${formatDateWithDay(day.date)}`,
  });

  return (
    <>
      <PageHeader
        title="נוכחות"
        description={`${formatDateWithDay(day.date)}${day.holidayName ? ` · ${day.holidayName}` : ""}`}
      />
      <AttendanceBoard
        key={day.date}
        day={day}
        initialShift={typeof params.shift === "string" ? params.shift : undefined}
        initialTeam={typeof params.team === "string" ? params.team : undefined}
      />
    </>
  );
}
