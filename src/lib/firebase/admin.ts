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

// Kept on globalThis: route handlers and pages can load this module separately (as in dev),
// while firebase-admin shares one Firestore instance, whose settings() may run only once.
const cached = globalThis as typeof globalThis & { __mishmarotFirestore?: Firestore };

export function db(): Firestore {
  if (!cached.__mishmarotFirestore) {
    const firestore = getFirestore(getApp());
    firestore.settings({ ignoreUndefinedProperties: true });
    cached.__mishmarotFirestore = firestore;
  }
  return cached.__mishmarotFirestore;
}

export function adminAuth() {
  return getAuth(getApp());
}

export function isEmulator(): boolean {
  return Boolean(process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST);
}
