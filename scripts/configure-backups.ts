/**
 * Makes sure the project's Firestore database has a daily backup schedule (used by CI on deploy).
 * Firestore takes the backups itself, once a day, and deletes each one after RETENTION_DAYS.
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json FIREBASE_PROJECT_ID=mishmarot-dev \
 *     npm run configure-backups
 *
 * The service account needs the "Cloud Datastore Backup Schedules Admin" role. Safe to run again:
 * an existing daily schedule is kept, and only its retention is updated if it differs.
 */
import { applicationDefault } from "firebase-admin/app";

const RETENTION_DAYS = 30;
const retention = `${RETENTION_DAYS * 24 * 60 * 60}s`;

interface BackupSchedule {
  name: string;
  retention: string;
  dailyRecurrence?: object;
  weeklyRecurrence?: object;
}

async function main() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error("FIREBASE_PROJECT_ID is required");
  const { access_token } = await applicationDefault().getAccessToken();
  const headers = { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" };
  const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/backupSchedules`;

  const list = await fetch(base, { headers });
  if (!list.ok)
    throw new Error(`Listing backup schedules failed: ${list.status} ${await list.text()}`);
  const { backupSchedules = [] } = (await list.json()) as { backupSchedules?: BackupSchedule[] };
  const daily = backupSchedules.find((s) => s.dailyRecurrence);

  if (!daily) {
    const res = await fetch(base, {
      method: "POST",
      headers,
      body: JSON.stringify({ retention, dailyRecurrence: {} }),
    });
    if (!res.ok)
      throw new Error(`Creating the backup schedule failed: ${res.status} ${await res.text()}`);
    console.log(`Created a daily Firestore backup for ${projectId}, kept ${RETENTION_DAYS} days`);
    return;
  }
  if (daily.retention !== retention) {
    const res = await fetch(
      `https://firestore.googleapis.com/v1/${daily.name}?updateMask=retention`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({ retention }),
      },
    );
    if (!res.ok)
      throw new Error(`Updating the backup schedule failed: ${res.status} ${await res.text()}`);
    console.log(`Daily backup retention of ${projectId} set to ${RETENTION_DAYS} days`);
    return;
  }
  console.log(`Daily Firestore backup of ${projectId} is in place (kept ${RETENTION_DAYS} days)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
