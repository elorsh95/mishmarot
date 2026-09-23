/**
 * Configures Firebase Authentication e-mails for a real project (used by CI on deploy):
 * - adds the app's domain to the authorized domains,
 * - points e-mail links at the app's own page (/auth/action) instead of Firebase's default one,
 *   when the project allows it (some projects answer EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED;
 *   the step then only warns). The e-mail text is Firebase's built-in Hebrew template.
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

  const patch = (mask: string, body: object) =>
    fetch(`${url}?updateMask=${mask}`, { method: "PATCH", headers, body: JSON.stringify(body) });

  if (!domains.includes(domain)) {
    const res = await patch("authorizedDomains", { authorizedDomains: [...domains, domain] });
    if (!res.ok) throw new Error(`Adding ${domain} failed: ${res.status} ${await res.text()}`);
  }
  console.log(`${domain} is an authorized domain of ${projectId}`);

  const res = await patch("notification.sendEmail.callbackUri", {
    notification: { sendEmail: { callbackUri: `${appUrl}/auth/action` } },
  });
  if (res.ok) {
    console.log(`Auth e-mails now link to ${appUrl}/auth/action`);
  } else {
    const text = await res.text();
    if (!text.includes("EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED")) {
      throw new Error(`Setting the e-mail link failed: ${res.status} ${text}`);
    }
    // Firebase locks e-mail settings on some projects. Links then open Firebase's own page,
    // which returns to the login page through the continue URL (see sendPasswordSetupEmail).
    console.log("::warning::Firebase doesn't allow changing the e-mail link on this project; using its default page.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
