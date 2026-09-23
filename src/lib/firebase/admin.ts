import { getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

/**
 * Single Admin SDK app for the whole server.
 *
 * - Locally: FIREBASE_PROJECT_ID + FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST
 *   point the SDK at the emulator suite.
 * - On Firebase App Hosting: FIREBASE_CONFIG is injected and credentials come from the
 *   backend's service account, so initializeApp() needs no arguments.
 * - Scripts against a real project: GOOGLE_APPLICATION_CREDENTIALS + FIREBASE_PROJECT_ID.
 */
function getApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;
  const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.GCLOUD_PROJECT;
  return projectId ? initializeApp({ projectId }) : initializeApp();
}

let firestore: Firestore | undefined;

export function db(): Firestore {
  if (!firestore) {
    firestore = getFirestore(getApp());
    firestore.settings({ ignoreUndefinedProperties: true });
  }
  return firestore;
}

export function adminAuth() {
  return getAuth(getApp());
}

export function isEmulator(): boolean {
  return Boolean(process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST);
}
