import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it } from "vitest";
import { getCatalog } from "@/modules/catalog/service";
import { getWeekView, setDayEntry } from "@/modules/schedule/service";
import { actors, baseData, clearEmulator, createAgentDoc, createTeamDoc } from "@/test/helpers";
import { monthlyReportXlsx, weekScheduleXlsx } from "./excel";
import { monthlyReport } from "./service";
import { homeDays } from "./types";

let base: Awaited<ReturnType<typeof baseData>>;

beforeEach(async () => {
  await clearEmulator();
  base = await baseData();
  await createTeamDoc("renault", "רנו", ["tm-user"]);
  await createTeamDoc("nissan", "ניסאן");
  await createAgentDoc("a1", "renault", { firstName: "דנה", lastName: "לוי" });
  await createAgentDoc("a2", "renault", { firstName: "יוסי", lastName: "כהן" });
  await createAgentDoc("a3", "nissan");
});

const home = () => ({ kind: "shift" as const, shiftId: base.morning.id, locationId: base.home.id });
const office = () => ({
  kind: "shift" as const,
  shiftId: base.morning.id,
  locationId: base.office.id,
});

async function readBook(buffer: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  return wb;
}

describe("monthly report", () => {
  beforeEach(async () => {
    const admin = actors.admin();
    // March 2030: a1 works 3 home days (third needs approval), one office day, one vacation day.
    await setDayEntry(admin, "a1", "2030-03-03", home());
    await setDayEntry(admin, "a1", "2030-03-04", home());
    await setDayEntry(admin, "a1", "2030-03-05", home());
    await setDayEntry(admin, "a1", "2030-03-06", office());
    await setDayEntry(admin, "a1", "2030-03-07", {
      kind: "absence",
      absenceTypeId: base.vacation.id,
    });
    await setDayEntry(admin, "a1", "2030-04-01", office()); // another month
    await setDayEntry(admin, "a3", "2030-03-03", office()); // another team
  });

  it("sums each agent's month within the actor's teams", async () => {
    const tm = actors.teamManager(["renault"]);
    const report = await monthlyReport(tm, "2030-03", null);
    expect(report.rows.map((r) => r.agentName)).toEqual(["דנה לוי", "יוסי כהן"]);
    const dana = report.rows[0];
    expect(dana).toMatchObject({ workDays: 4, absenceDays: 1, quota: 2 });
    expect(dana.home).toEqual({ withinQuota: 2, approved: 0, pending: 1, rejected: 0 });
    expect(homeDays(dana)).toBe(2);
    expect(dana.byShift[base.morning.id]).toBe(4);
    expect(dana.byAbsence[base.vacation.id]).toBe(1);
    expect(report.rows[1]).toMatchObject({ workDays: 0, absenceDays: 0 });

    // A team outside the manager's scope yields nothing
    expect((await monthlyReport(tm, "2030-03", "nissan")).rows).toEqual([]);
    const all = await monthlyReport(actors.admin(), "2030-03", null);
    expect(all.rows).toHaveLength(3);
  });

  it("exports the report to Excel with a totals row", async () => {
    const report = await monthlyReport(actors.admin(), "2030-03", "renault");
    const ws = (await readBook(await monthlyReportXlsx(report))).worksheets[0];
    const headers = (ws.getRow(1).values as string[]).slice(1);
    expect(headers.slice(0, 4)).toEqual(["נציג", "מספר עובד", "צוות", "ימי עבודה"]);
    expect(headers).toContain("ימי בית");
    expect(headers).toContain(base.vacation.name);
    expect(ws.getRow(2).getCell(1).value).toBe("דנה לוי");
    expect(ws.getRow(2).getCell(4).value).toBe(4);
    expect(ws.getRow(4).getCell(1).value).toBe("סה״כ");
    expect(ws.getRow(4).getCell(4).value).toMatchObject({ formula: "SUM(D2:D3)" });
  });
});

describe("weekly schedule export", () => {
  it("writes one sheet per team with the day's entries and coverage", async () => {
    const admin = actors.admin();
    await setDayEntry(admin, "a1", "2030-03-03", office());
    await setDayEntry(admin, "a2", "2030-03-04", {
      kind: "absence",
      absenceTypeId: base.vacation.id,
    });
    const catalog = await getCatalog();
    const views = await Promise.all(
      ["renault", "nissan"].map((t) => getWeekView(admin, t, "2030-03-03")),
    );
    const wb = await readBook(await weekScheduleXlsx(views, catalog));
    expect(wb.worksheets.map((w) => w.name)).toEqual(["רנו", "ניסאן"]);
    const ws = wb.worksheets[0];
    expect(String(ws.getRow(2).getCell(3).value)).toContain("ראשון 3.3");
    const dana = ws.getRow(3);
    expect(dana.getCell(1).value).toBe("דנה לוי");
    expect(dana.getCell(3).value).toBe(`${base.morning.name} · ${base.office.name}`);
    expect(ws.getRow(4).getCell(4).value).toBe(base.vacation.name);
    expect(String(ws.getRow(5).getCell(3).value)).toContain("בוקר 1");
  });
});
