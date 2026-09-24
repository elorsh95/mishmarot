import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it } from "vitest";
import { col, COLLECTIONS } from "@/lib/firebase/collections";
import { actors, baseData, clearEmulator, createAgentDoc, createTeamDoc } from "@/test/helpers";
import { agentImportTemplate, importAgents } from "./import";
import { createAgent, listAgents } from "./service";

const csv = (text: string) => ({ name: "agents.csv", bytes: new TextEncoder().encode(text) });

beforeEach(async () => {
  await clearEmulator();
  await baseData();
  await createTeamDoc("renault", "רנו");
  await createTeamDoc("daccia", "דאצ׳יה");
});

describe("agents without an employee number", () => {
  it("can be created, several of them", async () => {
    await createAgent(actors.admin(), { firstName: "דנה", lastName: "לוי", teamId: "renault" });
    await createAgent(actors.admin(), { firstName: "יוסי", lastName: "כהן", teamId: "renault" });
    const agents = await listAgents(actors.admin());
    expect(agents.map((a) => a.employeeNumber)).toEqual(["", ""]);
  });

  it("still rejects a duplicate number when one is given", async () => {
    await createAgent(actors.admin(), {
      firstName: "א",
      lastName: "ב",
      teamId: "renault",
      employeeNumber: "5",
    });
    await expect(
      createAgent(actors.admin(), {
        firstName: "ג",
        lastName: "ד",
        teamId: "renault",
        employeeNumber: "5",
      }),
    ).rejects.toThrow(/כבר קיים/);
  });
});

describe("importing agents", () => {
  it("previews without writing, then adds only the valid new rows", async () => {
    await createAgentDoc("a1", "renault", {
      firstName: "קיים",
      lastName: "כבר",
      employeeNumber: "900",
    });
    const file = csv(
      [
        "שם פרטי,שם משפחה,צוות,מספר עובד",
        "דנה,לוי,רנו,101",
        "יוסי,כהן,דאציה,",
        "קיים,כבר,רנו,",
        "רון,שחר,ליסינג,",
        "גל,ים,רנו,900",
        "מאיה,,רנו,",
      ].join("\n"),
    );

    const preview = await importAgents(actors.admin(), file, { dryRun: true });
    expect(preview.created).toBe(0);
    expect(preview.rows.map((r) => [r.line, r.status])).toEqual([
      [2, "new"],
      [3, "new"], // team names match without the geresh
      [4, "exists"],
      [5, "error"], // no such team
      [6, "error"], // employee number taken
      [7, "error"], // last name missing
    ]);
    expect((await col(COLLECTIONS.agents).get()).size).toBe(1);

    const result = await importAgents(actors.admin(), file, { dryRun: false });
    expect(result.created).toBe(2);
    const agents = await listAgents(actors.admin());
    expect(agents.map((a) => `${a.firstName} ${a.teamId} ${a.employeeNumber}`).sort()).toEqual([
      "דנה renault 101",
      "יוסי daccia ",
      "קיים renault 900",
    ]);
    const audit = await col(COLLECTIONS.auditLogs).where("action", "==", "agent.create").get();
    expect(audit.size).toBe(2);

    // Importing the same file again adds nothing
    expect((await importAgents(actors.admin(), file, { dryRun: false })).created).toBe(0);
  });

  it("a team manager can import only into their own teams; empty team uses the default", async () => {
    const tm = actors.teamManager(["renault"]);
    const file = csv("שם מלא,צוות\nדנה לוי,\nיוסי כהן,דאצ׳יה");
    const { rows, created } = await importAgents(tm, file, {
      defaultTeamId: "renault",
      dryRun: false,
    });
    expect(created).toBe(1);
    expect(rows[0]).toMatchObject({
      status: "new",
      teamId: "renault",
      firstName: "דנה",
      lastName: "לוי",
    });
    expect(rows[1]).toMatchObject({ status: "error", message: expect.stringMatching(/הרשאה/) });
  });

  it("reads the Excel template and rejects files it can't use", async () => {
    const template = await agentImportTemplate(actors.admin());
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(template as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0];
    expect(sheet.getRow(1).values).toEqual([undefined, "שם פרטי", "שם משפחה", "צוות", "מספר עובד"]);
    sheet.addRow(["נועה", "בר", "רנו", 42]);
    const bytes = new Uint8Array(await workbook.xlsx.writeBuffer());

    const { rows } = await importAgents(
      actors.admin(),
      { name: "נציגים.xlsx", bytes },
      { dryRun: true },
    );
    expect(rows).toEqual([
      expect.objectContaining({
        firstName: "נועה",
        teamId: "renault",
        employeeNumber: "42",
        status: "new",
      }),
    ]);

    await expect(
      importAgents(actors.admin(), { name: "a.xls", bytes }, { dryRun: true }),
    ).rejects.toThrow(/xls/);
    await expect(importAgents(actors.admin(), csv("טלפון\n050"), { dryRun: true })).rejects.toThrow(
      /כותרות/,
    );
    const noTeam = await importAgents(actors.admin(), csv("שם\nא ב"), { dryRun: true });
    expect(noTeam.rows[0]).toMatchObject({ status: "error", message: "לא צוין צוות" });
  });
});
