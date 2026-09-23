/**
 * Demo data for local development. Runs only against the Firebase emulator.
 *
 *   npm run emulators      # in one terminal
 *   npm run seed           # in another (add -- --reset to wipe the emulator first)
 */
import { parseArgs } from "node:util";
import { addDays, todayIso, weekDates, weekStartOf, weekdayOf } from "@/lib/dates";
import { col, COLLECTIONS } from "@/lib/firebase/collections";
import { createAgent } from "@/modules/agents/service";
import { getCatalog } from "@/modules/catalog/service";
import { DEFAULT_ROLES, SYSTEM_ROLE_IDS } from "@/modules/permissions/catalog";
import type { Actor } from "@/modules/permissions/check";
import { applyChanges } from "@/modules/schedule/engine";
import { setWeekStatus } from "@/modules/schedule/service";
import type { ChangeOp } from "@/modules/schedule/types";
import { createUserUnchecked } from "@/modules/users/service";
import { setupBase } from "./setup-base";

const PROJECT = process.env.FIREBASE_PROJECT_ID ?? "demo-mishmarot";

async function reset() {
  const fs = process.env.FIRESTORE_EMULATOR_HOST;
  const auth = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  await fetch(`http://${fs}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: "DELETE",
  });
  await fetch(`http://${auth}/emulator/v1/projects/${PROJECT}/accounts`, { method: "DELETE" });
}

function actorFor(id: string, fullName: string, roleId: string, managedTeamIds: string[]): Actor {
  const role = DEFAULT_ROLES.find((r) => r.id === roleId)!;
  return { id, fullName, roleId, permissions: role.permissions, managedTeamIds };
}

const AGENTS: Record<string, Array<[string, string]>> = {
  רנו: [
    ["אביגיל", "מזרחי"],
    ["בן", "אוחיון"],
    ["גלית", "שושן"],
    ["דוד", "ביטון"],
    ["הילה", "פרץ"],
    ["ויקטור", "אזולאי"],
    ["זיו", "חדד"],
    ["חן", "גבאי"],
  ],
  ניסאן: [
    ["טל", "אלון"],
    ["יעל", "ברק"],
    ["כרמל", "דהן"],
    ["ליאור", "וקנין"],
    ["מאיה", "זכאי"],
    ["נועם", "חזן"],
  ],
  "דאצ׳יה": [
    ["סתיו", "טל"],
    ["עומר", "יוסף"],
    ["פז", "כץ"],
  ],
};

async function main() {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error(
      "The seed script runs only against the emulator. Set FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST (see .env.example).",
    );
  }
  const { values } = parseArgs({ options: { reset: { type: "boolean", default: false } } });
  if (values.reset) {
    await reset();
    console.log("✓ emulator data wiped");
  } else if (!(await col(COLLECTIONS.users).limit(1).get()).empty) {
    console.log("The emulator already has data. Run `npm run seed -- --reset` to start over.");
    return;
  }

  const teams = await setupBase();
  const teamId = (name: string) => teams.find((t) => t.name === name)!.id;
  console.log(`✓ roles, settings, catalog, ${teams.length} teams`);

  const adminId = await createUserUnchecked({
    username: "admin",
    fullName: "מנהל מערכת",
    password: "Admin1234",
    roleId: SYSTEM_ROLE_IDS.admin,
    managedTeamIds: [],
  });
  await createUserUnchecked({
    username: "center",
    fullName: "דנה לוי",
    password: "Center1234",
    roleId: SYSTEM_ROLE_IDS.centerManager,
    managedTeamIds: [],
  });
  const renaultTmId = await createUserUnchecked({
    username: "yossi",
    fullName: "יוסי כהן",
    password: "Team1234",
    roleId: SYSTEM_ROLE_IDS.teamManager,
    managedTeamIds: [teamId("רנו")],
  });
  const nissanTmId = await createUserUnchecked({
    username: "michal",
    fullName: "מיכל אברהם",
    password: "Team1234",
    roleId: SYSTEM_ROLE_IDS.teamManager,
    managedTeamIds: [teamId("ניסאן"), teamId("דאצ׳יה")],
  });
  console.log("✓ users");

  const admin = actorFor(adminId, "מנהל מערכת", SYSTEM_ROLE_IDS.admin, []);
  const catalog = await getCatalog();
  const shift = (name: string) => catalog.shifts.find((s) => s.name === name)!.id;
  const location = (name: string) => catalog.locations.find((l) => l.name === name)!.id;

  let employeeNumber = 1001;
  const agentIds: Record<string, string[]> = {};
  for (const [teamName, people] of Object.entries(AGENTS)) {
    agentIds[teamName] = [];
    for (const [i, [firstName, lastName]] of people.entries()) {
      const id = await createAgent(admin, {
        employeeNumber: String(employeeNumber++),
        firstName,
        lastName,
        teamId: teamId(teamName),
        isActive: true,
        monthlyQuota: teamName === "רנו" && i === 0 ? 4 : null,
        defaultShiftId: shift(i % 3 === 1 ? "ערב" : "בוקר"),
        defaultLocationId: location("מוקד"),
        defaultDays: [0, 1, 2, 3, 4],
        notes: "",
      });
      agentIds[teamName].push(id);
    }
  }
  console.log("✓ agents");

  // Demo schedule: this week and next week for Renault and Nissan.
  const renaultTm = actorFor(renaultTmId, "יוסי כהן", SYSTEM_ROLE_IDS.teamManager, [teamId("רנו")]);
  const nissanTm = actorFor(nissanTmId, "מיכל אברהם", SYSTEM_ROLE_IDS.teamManager, [
    teamId("ניסאן"),
    teamId("דאצ׳יה"),
  ]);
  const thisWeek = weekStartOf(todayIso());
  const vacation = catalog.absenceTypes.find((a) => a.name === "חופשה")!.id;

  for (const [teamName, actor] of [
    ["רנו", renaultTm],
    ["ניסאן", nissanTm],
  ] as const) {
    const ops: ChangeOp[] = [];
    for (const week of [thisWeek, addDays(thisWeek, 7)]) {
      for (const [i, agentId] of agentIds[teamName].entries()) {
        for (const date of weekDates(week)) {
          const day = weekdayOf(date);
          if (day === 6) continue;
          if (day === 5) {
            // Friday: morning shift only, not everyone
            if (i % 2 === 0) {
              ops.push({
                agentId,
                date,
                entry: { kind: "shift", shiftId: shift("בוקר"), locationId: location("מוקד") },
              });
            }
            continue;
          }
          if (i === 3 && day === 2) {
            ops.push({ agentId, date, entry: { kind: "absence", absenceTypeId: vacation } });
            continue;
          }
          // Some agents work from home on Mondays and Wednesdays (the third time needs approval)
          const home = (i === 1 || i === 2) && (day === 1 || day === 3);
          ops.push({
            agentId,
            date,
            entry: {
              kind: "shift",
              shiftId: shift(day === 4 && i === 0 ? "כפולה" : i % 3 === 1 ? "ערב" : "בוקר"),
              locationId: location(home ? "בית" : "מוקד"),
            },
          });
        }
      }
    }
    const result = await applyChanges(actor, ops, { mode: "bulk" });
    console.log(
      `✓ ${teamName}: ${result.changed} entries, ${result.pendingApprovalIds.length} pending approvals, ${result.skipped.length} skipped`,
    );
  }
  await setWeekStatus(renaultTm, teamId("רנו"), thisWeek, "published");

  console.log(`
Demo users (username / password):
  admin  / Admin1234    מנהל מערכת
  center / Center1234   מנהלת מוקד
  yossi  / Team1234     מנהל צוות רנו
  michal / Team1234     מנהלת צוותים ניסאן + דאצ׳יה
`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
