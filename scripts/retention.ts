/**
 * Applies the data retention policy (Settings → אבטחה → שמירת מידע): deletes old logs,
 * attendance and schedule history, and erases the details of agents who left long ago.
 * Run daily by .github/workflows/retention.yml.
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json FIREBASE_PROJECT_ID=... \
 *     npm run retention -- [--dry-run]
 */
import { runRetention } from "@/modules/retention/service";
import { RESULT_LABELS, type RetentionResult } from "@/modules/retention/types";

async function main() {
  if (!process.env.FIREBASE_PROJECT_ID) throw new Error("FIREBASE_PROJECT_ID is required");
  const dryRun = process.argv.includes("--dry-run");
  const result = await runRetention(null, { dryRun });
  console.log(`${dryRun ? "Would delete" : "Deleted"} in ${process.env.FIREBASE_PROJECT_ID}:`);
  for (const key of Object.keys(result) as Array<keyof RetentionResult>) {
    console.log(`  ${key} (${RESULT_LABELS[key]}): ${result[key]}`);
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
