import { describe, expect, it } from "vitest";
import { decodeCsv, extractRows, parseCsv, splitFullName } from "./import-parse";

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, CRLF and a BOM", () => {
    expect(parseCsv('﻿שם,צוות\r\n"כהן, דנה","ה""ביתי"\r\n')).toEqual([
      ["שם", "צוות"],
      ["כהן, דנה", 'ה"ביתי'],
    ]);
  });

  it("detects semicolon and tab delimiters", () => {
    expect(parseCsv("a;b\n1;2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
    expect(parseCsv("a\tb\n1\t2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("decodeCsv", () => {
  it("falls back to Windows-1255 for Hebrew Excel exports", () => {
    const windows1255 = new Uint8Array([0xf9, 0xed]); // "שם"
    expect(decodeCsv(windows1255)).toBe("שם");
    expect(decodeCsv(new TextEncoder().encode("שם"))).toBe("שם");
  });
});

describe("extractRows", () => {
  it("maps the template columns and skips empty lines", () => {
    const rows = extractRows([
      ["שם פרטי", "שם משפחה", "צוות", "מספר עובד"],
      ["דנה", "לוי", "רנו", "123"],
      ["", "", "", ""],
      ["יוסי", "כהן", "ניסאן", ""],
    ]);
    expect(rows).toEqual([
      { line: 2, firstName: "דנה", lastName: "לוי", team: "רנו", employeeNumber: "123" },
      { line: 4, firstName: "יוסי", lastName: "כהן", team: "ניסאן", employeeNumber: "" },
    ]);
  });

  it("accepts a full-name column, header aliases and a title row above the header", () => {
    const rows = extractRows([
      ["רשימת נציגים"],
      ["צוות", "שם הנציג", "מס' עובד"],
      ["רנו", "דנה בר לוי", "7"],
    ]);
    expect(rows).toEqual([
      { line: 3, firstName: "דנה", lastName: "בר לוי", team: "רנו", employeeNumber: "7" },
    ]);
  });

  it("returns null without a name column", () => {
    expect(extractRows([["צוות", "טלפון"]])).toBeNull();
  });
});

describe("splitFullName", () => {
  it("keeps everything after the first word as the last name", () => {
    expect(splitFullName("  משה  בן דוד ")).toEqual({ firstName: "משה", lastName: "בן דוד" });
    expect(splitFullName("משה")).toEqual({ firstName: "משה", lastName: "" });
  });
});
