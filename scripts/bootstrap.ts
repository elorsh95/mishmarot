/**
 * First-time setup of a real Firebase project (dev or prod):
 * creates roles, settings, shifts/locations/absence types, the teams, and the first admin user.
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json FIREBASE_PROJECT_ID=mishmarot-dev \
 *     npm run bootstrap -- --username admin --name "שם מלא" --password "..."
 *
 * The admin can also come from BOOTSTRAP_ADMIN_USERNAME / BOOTSTRAP_ADMIN_NAME /
 * BOOTSTRAP_ADMIN_PASSWORD (used by CI on deploy). Safe to run again: existing data is kept.
 */
import { parseArgs } from "node:util";
import { isEmulator } from "@/lib/firebase/admin";
import { SYSTEM_ROLE_IDS } from "@/modules/permissions/catalog";
import { createUserUnchecked, findUserByUsername } from "@/modules/users/service";
import { setupBase } from "./setup-base";

async function main() {
  const { values } = parseArgs({
    options: {
      username: { type: "string" },
      name: { type: "string" },
      password: { type: "string" },
    },
  });
  values.username ??= process.env.BOOTSTRAP_ADMIN_USERNAME || undefined;
  values.name ??= process.env.BOOTSTRAP_ADMIN_NAME || undefined;
  values.password ??= process.env.BOOTSTRAP_ADMIN_PASSWORD || undefined;
  if (!process.env.FIREBASE_PROJECT_ID) throw new Error("FIREBASE_PROJECT_ID is required");
  console.log(
    `Bootstrapping project ${process.env.FIREBASE_PROJECT_ID}${isEmulator() ? " (emulator)" : ""}`,
  );

  const teams = await setupBase();
  console.log(`✓ roles, settings, catalog, ${teams.length} teams`);

  if (!values.username || !values.password || !values.name) {
    console.log("No --username/--name/--password given; skipping admin user.");
    return;
  }
  if (await findUserByUsername(values.username)) {
    console.log(`User "${values.username}" already exists; skipping.`);
    return;
  }
  await createUserUnchecked({
    username: values.username,
    fullName: values.name,
    password: values.password,
    roleId: SYSTEM_ROLE_IDS.admin,
    managedTeamIds: [],
  });
  console.log(`✓ admin user "${values.username}" created`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
