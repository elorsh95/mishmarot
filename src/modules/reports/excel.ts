import ExcelJS from "exceljs";
import { formatDayMonth, formatWeekRange, WEEKDAY_NAMES, weekdayOf } from "@/lib/dates";
import { agentName } from "@/modules/agents/types";
import { shiftWeekday } from "@/modules/calendar/types";
import type { Catalog } from "@/modules/catalog/service";
import type { WeekView } from "@/modules/schedule/service";
import { assignmentId, QUOTA_STATUS_LABELS } from "@/modules/schedule/types";
import { QUOTA_PERIOD_LABELS } from "@/modules/schedule/types";
import { reportRangeLabel, type ReportView } from "./period";
import { homeDays, overQuotaDays, shiftAverage, type Report } from "./types";

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE8ECF4" },
};
const TOTAL_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF3F4F6" },
};
const THIN: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFD1D5DB" } },
  bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
  left: { style: "thin", color: { argb: "FFD1D5DB" } },
  right: { style: "thin", color: { argb: "FFD1D5DB" } },
};

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  row.eachCell((c) => {
    c.fill = HEADER_FILL;
    c.border = THIN;
  });
}

/** A PNG's pixel size, from its IHDR header. */
function pngSize(png: Buffer): { width: number; height: number } {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

/**
 * Puts the company logo at the far (left, in RTL) end of the sheet's first row, `height` px tall.
 * `lastColumn` is the 1-based last column the sheet uses.
 */
function addLogo(wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet, logo: Buffer, lastColumn: number) {
  const { width, height } = pngSize(logo);
  const h = 34;
  const w = Math.min(160, Math.round((width / height) * h));
  const id = wb.addImage({ buffer: logo as unknown as ExcelJS.Buffer, extension: "png" });
  ws.getRow(1).height = 30;
  ws.addImage(id, {
    tl: { col: Math.max(0, lastColumn - 1) + 0.1, row: 0.1 },
    ext: { width: w, height: h },
    editAs: "oneCell",
  });
}

/** Excel sheet names: at most 31 characters, none of []:*?/\ and unique in the workbook. */
function sheetName(name: string, used: Set<string>): string {
  const base = name.replace(/[[\]:*?/\\]/g, " ").slice(0, 28) || "גיליון";
  let candidate = base;
  for (let i = 2; used.has(candidate); i++) candidate = `${base} ${i}`;
  used.add(candidate);
  return candidate;
}

type Column<R> = { header: string; width: number; value: (r: R) => string | number };

/**
 * Writes a table sheet: a title row (with the logo), a header row, one row per item and a SUM row
 * for the numeric columns (except those in `noTotal`, and the first `labelColumns` columns).
 */
function tableSheet<R>(
  wb: ExcelJS.Workbook,
  name: string,
  columns: Column<R>[],
  rows: R[],
  {
    title,
    logo,
    labelColumns = 1,
    noTotal = [] as string[],
    style,
  }: {
    /** The first row, above the headers (with the logo, if any). */
    title: string;
    logo?: Buffer | null;
    labelColumns?: number;
    noTotal?: string[];
    style?: (row: ExcelJS.Row, item: R) => void;
  },
) {
  const ws = wb.addWorksheet(name, {
    views: [{ rightToLeft: true, state: "frozen", ySplit: 2, xSplit: 1 }],
  });
  columns.forEach((c, i) => (ws.getColumn(i + 1).width = c.width));
  ws.addRow([title]).font = { bold: true, size: 13 };
  ws.getRow(1).alignment = { vertical: "middle" };
  if (logo) addLogo(wb, ws, logo, columns.length);
  const header = ws.addRow(columns.map((c) => c.header));
  styleHeader(header);
  header.height = 32;
  for (const item of rows) {
    const row = ws.addRow(columns.map((c) => c.value(item)));
    row.eachCell((c) => (c.border = THIN));
    style?.(row, item);
  }
  if (rows.length > 0) {
    const first = 3;
    const last = rows.length + 2;
    const totals = ws.addRow(
      columns.map((c, i) => {
        if (i === 0) return "סה״כ";
        if (i < labelColumns || noTotal.includes(c.header)) return "";
        const letter = ws.getColumn(i + 1).letter;
        return { formula: `SUM(${letter}${first}:${letter}${last})` };
      }),
    );
    totals.font = { bold: true };
    totals.eachCell((c) => {
      c.fill = TOTAL_FILL;
      c.border = THIN;
    });
  }
  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: columns.length } };
  return ws;
}

type AgentRow = Report["rows"][number];
type ShiftRow = Report["shiftRows"][number];

/** The report as Excel: by agents (one row per agent) or by shifts (plus an absences sheet). */
export async function reportXlsx(
  report: Report,
  view: ReportView,
  logo: Buffer | null = null,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const used = new Set<string>();
  const label = reportRangeLabel(report.range);
  const scope = report.teamName ?? "כל הצוותים";

  if (view === "shifts") {
    const weekdays = WEEKDAY_NAMES.map((_, i) => i).filter((i) =>
      report.shiftRows.some((r) => r.byWeekday[i] > 0),
    );
    const locations = report.locations.filter((l) =>
      report.shiftRows.some((r) => r.byLocation[l.id]),
    );
    tableSheet<ShiftRow>(
      wb,
      sheetName(`משמרות ${label}`, used),
      [
        { header: "משמרת", width: 18, value: (r) => r.name },
        { header: "שיבוצים", width: 10, value: (r) => r.total },
        { header: "נציגים", width: 9, value: (r) => r.agents },
        { header: "ימים", width: 8, value: (r) => r.days },
        { header: "ממוצע ליום", width: 10, value: (r) => shiftAverage(r) },
        ...locations.map((l) => ({
          header: l.name,
          width: 9,
          value: (r: ShiftRow) => r.byLocation[l.id] ?? 0,
        })),
        ...weekdays.map((i) => ({
          header: WEEKDAY_NAMES[i],
          width: 8,
          value: (r: ShiftRow) => r.byWeekday[i],
        })),
        { header: "ממתין לאישור", width: 11, value: (r) => r.pending },
        { header: "נדחה", width: 8, value: (r) => r.rejected },
      ],
      report.shiftRows,
      // Distinct counts and averages don't add up across shifts.
      {
        title: `דוח משמרות - ${scope} - ${label}`,
        logo,
        noTotal: ["נציגים", "ימים", "ממוצע ליום"],
      },
    );
    tableSheet(
      wb,
      sheetName("היעדרויות", used),
      [
        { header: "סוג היעדרות", width: 18, value: (r: Report["absenceRows"][number]) => r.name },
        { header: "ימים", width: 8, value: (r) => r.days },
        { header: "נציגים", width: 9, value: (r) => r.agents },
      ],
      report.absenceRows,
      { title: `היעדרויות - ${scope} - ${label}`, logo, noTotal: ["נציגים"] },
    );
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  const columns: Column<AgentRow>[] = [
    { header: "נציג", width: 22, value: (r) => r.agentName },
    { header: "מספר עובד", width: 12, value: (r) => r.employeeNumber },
    { header: "צוות", width: 14, value: (r) => r.teamName },
    { header: "ימי עבודה", width: 10, value: (r) => r.workDays },
    ...report.shifts.map((s) => ({
      header: s.name,
      width: 9,
      value: (r: AgentRow) => r.byShift[s.id] ?? 0,
    })),
    { header: "ימי בית", width: 9, value: (r) => homeDays(r) },
    {
      header: `מכסה (${QUOTA_PERIOD_LABELS[report.quotaPeriod].per})`,
      width: 10,
      value: (r) => r.quota,
    },
    { header: "מעבר למכסה (אושר)", width: 12, value: (r) => r.home.approved },
    { header: "ממתין לאישור", width: 11, value: (r) => r.home.pending },
    { header: "נדחה", width: 8, value: (r) => r.home.rejected },
    ...report.absences.map((a) => ({
      header: a.name,
      width: 9,
      value: (r: AgentRow) => r.byAbsence[a.id] ?? 0,
    })),
    { header: "סה״כ היעדרויות", width: 12, value: (r) => r.absenceDays },
  ];
  const homeCol = columns.findIndex((c) => c.header === "ימי בית") + 1;
  tableSheet(wb, sheetName(label, used), columns, report.rows, {
    title: `דוח נציגים - ${scope} - ${label}`,
    logo,
    labelColumns: 3,
    noTotal: [columns.find((c) => c.header.startsWith("מכסה"))!.header],
    style: (row, r) => {
      if (!r.isActive) row.font = { color: { argb: "FF6B7280" } };
      if (overQuotaDays(r) > 0)
        row.getCell(homeCol).font = { bold: true, color: { argb: "FFB45309" } };
    },
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Weekly schedule: one sheet per team, agents by days, with the day's coverage below. */
export async function weekScheduleXlsx(
  views: WeekView[],
  catalog: Catalog,
  logo: Buffer | null = null,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const used = new Set<string>();
  const shiftOf = (id: string | null) => catalog.shifts.find((s) => s.id === id);
  const locationOf = (id: string | null) => catalog.locations.find((l) => l.id === id);
  const absenceOf = (id: string | null) => catalog.absenceTypes.find((a) => a.id === id);

  for (const view of views) {
    const ws = wb.addWorksheet(sheetName(view.team.name, used), {
      views: [{ rightToLeft: true, state: "frozen", ySplit: 2, xSplit: 1 }],
    });
    ws.addRow([
      `סידור עבודה - ${view.team.name} - ${formatWeekRange(view.weekStart)}${view.week.status === "draft" ? " (טיוטה)" : ""}`,
    ]).font = { bold: true, size: 13 };
    ws.mergeCells(1, 1, 1, view.days.length + 2);
    ws.getRow(1).alignment = { vertical: "middle" };
    if (logo) addLogo(wb, ws, logo, view.days.length + 2);

    const header = ws.addRow([
      "נציג",
      "מספר עובד",
      ...view.days.map((d) => {
        const info = view.dayInfo[d];
        const label = `${WEEKDAY_NAMES[weekdayOf(d)]} ${formatDayMonth(d)}`;
        if (!info?.name && info?.kind !== "closed") return label;
        const suffix =
          info.kind === "closed" ? " · סגור" : info.kind === "eve" ? " · כמו שישי" : "";
        return `${label}\n${info.name ?? "חג"}${suffix}`;
      }),
    ]);
    styleHeader(header);
    header.height = view.days.some((d) => view.dayInfo[d]?.name) ? 32 : 18;
    ws.getColumn(1).width = 22;
    ws.getColumn(2).width = 11;
    view.days.forEach((_, i) => (ws.getColumn(i + 3).width = 16));

    const agents = view.agents.filter(
      (a) =>
        (a.isActive && a.inTeam) || view.days.some((d) => view.assignments[assignmentId(a.id, d)]),
    );
    for (const agent of agents) {
      const row = ws.addRow([
        agentName(agent),
        agent.employeeNumber ?? "",
        ...view.days.map((d) => {
          const e = view.assignments[assignmentId(agent.id, d)];
          if (!e) return view.dayInfo[d]?.kind === "closed" ? "סגור" : "";
          if (e.kind === "absence") return absenceOf(e.absenceTypeId)?.name ?? "היעדרות";
          const text = [shiftOf(e.shiftId)?.name, locationOf(e.locationId)?.name]
            .filter(Boolean)
            .join(" · ");
          return e.quotaStatus === "pending" || e.quotaStatus === "rejected"
            ? `${text} (${QUOTA_STATUS_LABELS[e.quotaStatus]})`
            : text;
        }),
      ]);
      row.alignment = { vertical: "middle", horizontal: "center" };
      row.getCell(1).alignment = { horizontal: "right" };
      row.eachCell({ includeEmpty: true }, (c) => (c.border = THIN));
      view.days.forEach((d, i) => {
        const e = view.assignments[assignmentId(agent.id, d)];
        const cell = row.getCell(i + 3);
        const color =
          e?.kind === "shift"
            ? shiftOf(e.shiftId)?.color
            : e
              ? absenceOf(e.absenceTypeId)?.color
              : null;
        if (color)
          cell.font = { color: { argb: `FF${color.slice(1)}` }, bold: e?.kind === "shift" };
        if (e?.quotaStatus === "rejected") cell.font = { ...cell.font, strike: true };
        if (!e && view.dayInfo[d]?.kind === "closed") cell.font = { color: { argb: "FF9CA3AF" } };
      });
    }

    const coverage = view.days.map((d) => {
      let morning = 0;
      let evening = 0;
      let absent = 0;
      for (const agent of agents) {
        const e = view.assignments[assignmentId(agent.id, d)];
        if (!e) continue;
        if (e.kind === "absence") absent += 1;
        else if (e.quotaStatus !== "rejected") {
          const s = shiftOf(e.shiftId);
          if (s?.coversMorning) morning += 1;
          if (s?.coversEvening) evening += 1;
        }
      }
      const parts = [`בוקר ${morning}`];
      if (shiftWeekday(d, view.dayInfo[d]) !== 5) parts.push(`ערב ${evening}`);
      if (absent) parts.push(`נעדרים ${absent}`);
      return parts.join(" · ");
    });
    const total = ws.addRow(["סה״כ ביום", "", ...coverage]);
    total.font = { bold: true };
    total.alignment = { horizontal: "center" };
    total.eachCell({ includeEmpty: true }, (c) => {
      c.fill = TOTAL_FILL;
      c.border = THIN;
    });
  }
  if (views.length === 0) wb.addWorksheet("סידור");
  return Buffer.from(await wb.xlsx.writeBuffer());
}
