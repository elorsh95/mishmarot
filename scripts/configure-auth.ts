/**
 * Configures Firebase Authentication e-mails for a real project (used by CI on deploy):
 * - adds the app's domain to the authorized domains,
 * - points e-mail links at the app's own page (/auth/action) instead of Firebase's default one.
 *
 * The e-mail text itself can't be changed through the API on this project
 * (EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED), so Firebase's built-in Hebrew template is used.
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json FIREBASE_PROJECT_ID=mishmarot-dev \
 *     APP_URL=https://... npm run configure-auth
 *
 * The service account needs the "Firebase Authentication Admin" role. Safe to run again.
 */
import { applicationDefault } from "firebase-admin/app";

type Config = { authorizedDomains?: string[] };

async function main() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const appUrl = process.env.APP_URL?.replace(/\/+$/, "");
  if (!projectId) throw new Error("FIREBASE_PROJECT_ID is required");
  if (!appUrl) {
    console.log("APP_URL is not set; skipping auth e-mail configuration.");
    return;
  }
  const domain = new URL(appUrl).hostname;
  const { access_token } = await applicationDefault().getAccessToken();
  const url = `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config`;
  const headers = { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" };

  const current = await fetch(url, { headers });
  if (!current.ok) throw new Error(`Reading auth config failed: ${current.status} ${await current.text()}`);
  const config = (await current.json()) as Config;
  const domains = config.authorizedDomains ?? [];

  const updateMask = "authorizedDomains,notification.sendEmail.callbackUri";
  const res = await fetch(`${url}?updateMask=${updateMask}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      authorizedDomains: domains.includes(domain) ? domains : [...domains, domain],
      notification: {
        sendEmail: {
          callbackUri: `${appUrl}/auth/action`,
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`Updating auth config failed: ${res.status} ${await res.text()}`);
  console.log(`Auth e-mails of ${projectId} now link to ${appUrl}/auth/action`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
