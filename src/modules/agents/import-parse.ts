/**
 * Pure parsing for the agents import (Excel/CSV). No I/O, so it is unit-tested directly.
 */

export type ImportColumn = "firstName" | "lastName" | "fullName" | "team" | "employeeNumber";

/** The headers of the downloadable template, in order. */
export const TEMPLATE_HEADERS = ["שם פרטי", "שם משפחה", "צוות", "מספר עובד"] as const;

const HEADER_ALIASES: Record<ImportColumn, string[]> = {
  firstName: ["שם פרטי", "פרטי", "first name", "firstname"],
  lastName: ["שם משפחה", "משפחה", "last name", "lastname", "surname"],
  fullName: ["שם מלא", "שם", "שם הנציג", "שם נציג", "נציג", "name", "full name"],
  team: ["צוות", "שם צוות", "team"],
  employeeNumber: ["מספר עובד", "מס עובד", "employee number", "employee id"],
};

/** Case, spacing and quote marks (״ ׳ " ') don't matter when matching headers and team names. */
export function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/["'`׳״’‘“”.]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const ALIAS_TO_COLUMN = new Map<string, ImportColumn>(
  (Object.entries(HEADER_ALIASES) as [ImportColumn, string[]][]).flatMap(([col, names]) =>
    names.map((n) => [normalizeKey(n), col] as const),
  ),
);

export type HeaderMap = Partial<Record<ImportColumn, number>>;

/**
 * Finds the header row among the first rows of the sheet (a title row above it is allowed).
 * A usable header has a name (first+last or full name).
 */
export function findHeader(rows: string[][]): { index: number; columns: HeaderMap } | null {
  for (let index = 0; index < Math.min(rows.length, 10); index++) {
    const columns: HeaderMap = {};
    rows[index].forEach((cell, i) => {
      const col = ALIAS_TO_COLUMN.get(normalizeKey(cell));
      if (col && columns[col] === undefined) columns[col] = i;
    });
    if (columns.fullName !== undefined || columns.firstName !== undefined) {
      return { index, columns };
    }
  }
  return null;
}

/** "ישראל ישראלי" → first "ישראל", last "ישראלי"; a longer name keeps the rest as the last name. */
export function splitFullName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") };
}

export interface RawAgentRow {
  /** 1-based line in the file, for messages. */
  line: number;
  firstName: string;
  lastName: string;
  team: string;
  employeeNumber: string;
}

export function extractRows(rows: string[][]): RawAgentRow[] | null {
  const header = findHeader(rows);
  if (!header) return null;
  const { columns } = header;
  const cell = (row: string[], col: ImportColumn) =>
    columns[col] === undefined ? "" : (row[columns[col]!] ?? "").trim();
  const out: RawAgentRow[] = [];
  for (let i = header.index + 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.every((c) => !c.trim())) continue;
    let firstName = cell(row, "firstName");
    let lastName = cell(row, "lastName");
    if (!firstName && !lastName) ({ firstName, lastName } = splitFullName(cell(row, "fullName")));
    else if (firstName && !lastName && columns.lastName === undefined) {
      ({ firstName, lastName } = splitFullName(firstName));
    }
    out.push({
      line: i + 1,
      firstName,
      lastName,
      team: cell(row, "team"),
      employeeNumber: cell(row, "employeeNumber"),
    });
  }
  return out;
}

/**
 * Minimal RFC 4180 CSV parser: quoted fields, "" escapes, newlines inside quotes.
 * The delimiter is detected from the first line (comma, semicolon or tab).
 */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.slice(0, clean.search(/\r?\n|$/));
  const delimiter = [",", ";", "\t"]
    .map((d) => ({ d, n: firstLine.split(d).length }))
    .sort((a, b) => b.n - a.n)[0].d;

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Excel on Hebrew Windows often saves CSV as Windows-1255 rather than UTF-8. */
export function decodeCsv(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1255").decode(bytes);
  }
}
