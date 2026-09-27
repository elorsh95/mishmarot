import {
  FieldValue,
  Timestamp,
  type DocumentData,
  type DocumentSnapshot,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import { db } from "./admin";

/** Every Firestore collection used by the app, in one place. */
export const COLLECTIONS = {
  roles: "roles",
  users: "users",
  teams: "teams",
  agents: "agents",
  shifts: "shifts",
  locations: "locations",
  absenceTypes: "absenceTypes",
  assignments: "assignments",
  approvals: "approvals",
  weeks: "weeks",
  transfers: "transfers",
  settings: "settings",
  auditLogs: "auditLogs",
  specialDays: "specialDays",
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];

export function col(name: CollectionName) {
  return db().collection(name);
}

export const serverNow = () => FieldValue.serverTimestamp();

/** Converts Firestore Timestamps to ISO strings recursively so data is serializable. */
function normalize(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalize(v)]));
  }
  return value;
}

export function fromDoc<T>(snap: DocumentSnapshot<DocumentData> | QueryDocumentSnapshot): T {
  return { ...(normalize(snap.data()) as object), id: snap.id } as T;
}

export function fromDocOrNull<T>(snap: DocumentSnapshot<DocumentData>): T | null {
  return snap.exists ? fromDoc<T>(snap) : null;
}

/** Firestore `in` queries accept at most 30 values. */
export function chunk<T>(items: T[], size = 30): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
