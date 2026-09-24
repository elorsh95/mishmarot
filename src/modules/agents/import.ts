import ExcelJS from "exceljs";
import { db } from "@/lib/firebase/admin";
import { col, COLLECTIONS, serverNow } from "@/lib/firebase/collections";
import { DomainError } from "@/lib/errors";
import { auditInTx } from "@/modules/audit/service";
import { assertCan, canForTeam, type Actor } from "@/modules/permissions/check";
import { listAllTeams } from "@/modules/teams/service";
import {
  decodeCsv,
  extractRows,
  normalizeKey,
  parseCsv,
  TEMPLATE_HEADERS,
  type RawAgentRow,
} from "./import-parse";
import { agentInputSchema } from "./service";
import {
  AGENT_IMPORT_MAX_ROWS,
  agentName,
  type AgentImportResult,
  type AgentImportRow,
} from "./types";

export interface ImportFile {
  name: string;
  bytes: Uint8Array;
}

/** Reads the first sheet of an .xlsx file, or a .csv file, into rows of text cells. */
async function readTable(file: ImportFile): Promise<string[][]> {
  const ext = file.name.toLowerCase().split(".").pop();
  if (ext === "csv" || ext === "txt") return parseCsv(decodeCsv(file.bytes));
  if (ext === "xls")
    throw new DomainError("קובץ Excel ישן (xls) לא נתמך. יש לשמור אותו כ-xlsx או כ-CSV");
  if (ext !== "xlsx") throw new DomainError("יש להעלות קובץ Excel (xlsx) או CSV");

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(file.bytes as unknown as ArrayBuffer);
  } catch {
    throw new DomainError("לא ניתן לקרוא את הקובץ. ודאו שזה קובץ Excel תקין");
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cells[colNumber - 1] = cell.text ?? "";
    });
    rows[rowNumber - 1] = Array.from(cells, (c) => c ?? "");
  });
  return Array.from(rows, (r) => r ?? []);
}

/**
 * Validates an agents file against the teams the actor manages and the existing agents.
 * Rows already in the team (same name) are skipped rather than duplicated.
 */
async function planImport(
  actor: Actor,
  file: ImportFile,
  defaultTeamId: string | null,
): Promise<AgentImportRow[]> {
  const raw = extractRows(await readTable(file));
  if (!raw) {
    throw new DomainError(
      `לא נמצאה שורת כותרות. השורה הראשונה צריכה לכלול: ${TEMPLATE_HEADERS.join(", ")}`,
    );
  }
  if (raw.length === 0) throw new DomainError("אין בקובץ נציגים לייבוא");
  if (raw.length > AGENT_IMPORT_MAX_ROWS) {
    throw new DomainError(`אפשר לייבא עד ${AGENT_IMPORT_MAX_ROWS} נציגים בקובץ אחד`);
  }

  const teams = (await listAllTeams()).filter((t) => t.isActive);
  const teamByKey = new Map(teams.map((t) => [normalizeKey(t.name), t]));
  const existing = (
    await col(COLLECTIONS.agents).select("firstName", "lastName", "teamId", "employeeNumber").get()
  ).docs;
  const nameKey = (teamId: string, first: string, last: string) =>
    `${teamId}|${normalizeKey(`${first} ${last}`)}`;
  const takenNames = new Set(
    existing.map((d) => nameKey(d.get("teamId"), d.get("firstName"), d.get("lastName"))),
  );
  const takenNumbers = new Set(
    existing.map((d) => String(d.get("employeeNumber") ?? "")).filter(Boolean),
  );

  return raw.map((r: RawAgentRow): AgentImportRow => {
    const base = {
      line: r.line,
      firstName: r.firstName,
      lastName: r.lastName,
      employeeNumber: r.employeeNumber,
    };
    const team = r.team
      ? teamByKey.get(normalizeKey(r.team))
      : teams.find((t) => t.id === defaultTeamId);
    const teamName = team?.name ?? r.team;
    const fail = (message: string): AgentImportRow => ({
      ...base,
      teamId: team?.id ?? null,
      teamName,
      status: "error",
      message,
    });

    if (!team) return fail(r.team ? `הצוות "${r.team}" לא קיים` : "לא צוין צוות");
    if (!canForTeam(actor, "agents.manage", team.id))
      return fail("אין לך הרשאה להוסיף נציגים לצוות זה");
    const parsed = agentInputSchema.safeParse({ ...base, teamId: team.id });
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "נתונים לא תקינים");

    const key = nameKey(team.id, r.firstName, r.lastName);
    if (takenNames.has(key)) {
      return { ...base, teamId: team.id, teamName, status: "exists", message: "כבר קיים בצוות" };
    }
    if (r.employeeNumber && takenNumbers.has(r.employeeNumber)) {
      return fail(`מספר עובד ${r.employeeNumber} כבר קיים`);
    }
    takenNames.add(key);
    if (r.employeeNumber) takenNumbers.add(r.employeeNumber);
    return { ...base, teamId: team.id, teamName, status: "new", message: null };
  });
}

/** Rows per transaction: each agent is two writes (agent + audit), well under Firestore's 500. */
const CHUNK = 200;

/**
 * Imports agents from an Excel/CSV file. With `dryRun` nothing is written and the result is a preview.
 * Only rows marked "new" are added; errors and existing agents are skipped.
 */
export async function importAgents(
  actor: Actor,
  file: ImportFile,
  { defaultTeamId = null, dryRun }: { defaultTeamId?: string | null; dryRun: boolean },
): Promise<AgentImportResult> {
  assertCan(actor, "agents.manage");
  const rows = await planImport(actor, file, defaultTeamId);
  const toCreate = rows.filter((r) => r.status === "new");
  if (dryRun || toCreate.length === 0) return { rows, created: 0 };

  for (let i = 0; i < toCreate.length; i += CHUNK) {
    await db().runTransaction(async (tx) => {
      for (const r of toCreate.slice(i, i + CHUNK)) {
        const data = agentInputSchema.parse({
          firstName: r.firstName,
          lastName: r.lastName,
          employeeNumber: r.employeeNumber,
          teamId: r.teamId,
        });
        const ref = col(COLLECTIONS.agents).doc();
        tx.set(ref, { ...data, createdAt: serverNow(), updatedAt: serverNow() });
        auditInTx(tx, actor, {
          action: "agent.create",
          entityType: "agent",
          entityId: ref.id,
          teamId: data.teamId,
          summary: `נוסף נציג ${agentName(data)} לצוות ${r.teamName} (ייבוא מקובץ)`,
          after: data,
        });
      }
    });
  }
  return { rows, created: toCreate.length };
}

/** The downloadable template: the headers, plus a team list the "צוות" column picks from. */
export async function agentImportTemplate(actor: Actor): Promise<Buffer> {
  assertCan(actor, "agents.manage");
  const teams = (await listAllTeams()).filter(
    (t) => t.isActive && canForTeam(actor, "agents.manage", t.id),
  );
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("נציגים", {
    views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }],
  });
  sheet.columns = TEMPLATE_HEADERS.map((header) => ({ header, width: 18 }));
  sheet.getRow(1).font = { bold: true };

  const list = workbook.addWorksheet("צוותים", { views: [{ rightToLeft: true }] });
  list.getColumn(1).width = 24;
  list.addRow(["צוותים"]).font = { bold: true };
  for (const t of teams) list.addRow([t.name]);

  if (teams.length > 0) {
    const teamCol = TEMPLATE_HEADERS.indexOf("צוות") + 1;
    for (let row = 2; row <= AGENT_IMPORT_MAX_ROWS + 1; row++) {
      sheet.getCell(row, teamCol).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [`'צוותים'!$A$2:$A$${teams.length + 1}`],
        showErrorMessage: true,
        errorTitle: "צוות לא קיים",
        error: "יש לבחור צוות מהרשימה",
      };
    }
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
