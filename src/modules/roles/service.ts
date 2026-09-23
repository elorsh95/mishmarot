import { z } from "zod";
import { db } from "@/lib/firebase/admin";
import { col, COLLECTIONS, fromDoc, fromDocOrNull, serverNow } from "@/lib/firebase/collections";
import { DomainError, NotFoundError } from "@/lib/errors";
import { auditInTx } from "@/modules/audit/service";
import {
  DEFAULT_ROLES,
  PERMISSIONS,
  PERMISSION_KEYS,
  SYSTEM_ROLE_IDS,
  type PermissionKey,
  type RolePermissions,
} from "@/modules/permissions/catalog";
import { assertCan, type Actor } from "@/modules/permissions/check";

export interface Role {
  id: string;
  name: string;
  description: string;
  isSystem: boolean;
  permissions: RolePermissions;
}

export async function listRoles(): Promise<Role[]> {
  const snap = await col(COLLECTIONS.roles).get();
  const order = Object.values(SYSTEM_ROLE_IDS) as string[];
  return snap.docs
    .map((d) => fromDoc<Role>(d))
    .sort((a, b) => {
      const ia = order.indexOf(a.id);
      const ib = order.indexOf(b.id);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.name.localeCompare(b.name, "he");
    });
}

export async function getRole(id: string): Promise<Role | null> {
  return fromDocOrNull<Role>(await col(COLLECTIONS.roles).doc(id).get());
}

/** Drops unknown keys and forces unscoped permissions to "all". */
export function sanitizePermissions(input: Record<string, string>): RolePermissions {
  const out: RolePermissions = {};
  for (const key of PERMISSION_KEYS) {
    const value = input[key];
    if (value !== "all" && value !== "own_teams") continue;
    out[key] = PERMISSIONS[key].scoped ? value : "all";
  }
  return out;
}

export const roleInputSchema = z.object({
  name: z.string().trim().min(2, "שם תפקיד קצר מדי").max(50),
  description: z.string().trim().max(200).default(""),
  permissions: z.record(z.string(), z.string()),
});

export async function createRole(actor: Actor, input: z.infer<typeof roleInputSchema>) {
  assertCan(actor, "roles.manage");
  const data = roleInputSchema.parse(input);
  const ref = col(COLLECTIONS.roles).doc();
  const role = {
    name: data.name,
    description: data.description,
    isSystem: false,
    permissions: sanitizePermissions(data.permissions),
  };
  await db().runTransaction(async (tx) => {
    tx.set(ref, { ...role, createdAt: serverNow(), updatedAt: serverNow() });
    auditInTx(tx, actor, {
      action: "role.create",
      entityType: "role",
      entityId: ref.id,
      summary: `נוצר תפקיד "${role.name}"`,
      after: role,
    });
  });
  return ref.id;
}

export async function updateRole(
  actor: Actor,
  roleId: string,
  input: z.infer<typeof roleInputSchema>,
) {
  assertCan(actor, "roles.manage");
  if (roleId === SYSTEM_ROLE_IDS.admin) {
    throw new DomainError("לא ניתן לשנות את הרשאות מנהל המערכת");
  }
  const data = roleInputSchema.parse(input);
  const ref = col(COLLECTIONS.roles).doc(roleId);
  await db().runTransaction(async (tx) => {
    const before = fromDocOrNull<Role>(await tx.get(ref));
    if (!before) throw new NotFoundError("התפקיד לא נמצא");
    const after = {
      name: data.name,
      description: data.description,
      permissions: sanitizePermissions(data.permissions),
    };
    tx.update(ref, { ...after, updatedAt: serverNow() });
    auditInTx(tx, actor, {
      action: "role.update",
      entityType: "role",
      entityId: roleId,
      summary: `עודכן תפקיד "${after.name}"`,
      before: { name: before.name, permissions: before.permissions },
      after,
    });
  });
}

export async function deleteRole(actor: Actor, roleId: string) {
  assertCan(actor, "roles.manage");
  const ref = col(COLLECTIONS.roles).doc(roleId);
  const role = fromDocOrNull<Role>(await ref.get());
  if (!role) throw new NotFoundError("התפקיד לא נמצא");
  if (role.isSystem) throw new DomainError("לא ניתן למחוק תפקיד מערכת");
  const users = await col(COLLECTIONS.users).where("roleId", "==", roleId).limit(1).get();
  if (!users.empty) throw new DomainError("יש משתמשים המשויכים לתפקיד זה. יש להעביר אותם קודם");
  await db().runTransaction(async (tx) => {
    tx.delete(ref);
    auditInTx(tx, actor, {
      action: "role.delete",
      entityType: "role",
      entityId: roleId,
      summary: `נמחק תפקיד "${role.name}"`,
      before: role,
    });
  });
}

/**
 * Creates the default roles if missing. Existing roles are left as edited by the admin,
 * except the admin role, which always receives every permission (so it can never lock itself out).
 */
export async function ensureDefaultRoles() {
  for (const def of DEFAULT_ROLES) {
    const ref = col(COLLECTIONS.roles).doc(def.id);
    const snap = await ref.get();
    if (!snap.exists) {
      await ref.set({
        name: def.name,
        description: def.description,
        isSystem: true,
        permissions: def.permissions,
        createdAt: serverNow(),
        updatedAt: serverNow(),
      });
    } else if (def.id === SYSTEM_ROLE_IDS.admin) {
      await ref.update({ permissions: def.permissions, isSystem: true });
    }
  }
}

export function permissionGroups(): Array<{ group: string; keys: PermissionKey[] }> {
  const groups = new Map<string, PermissionKey[]>();
  for (const key of PERMISSION_KEYS) {
    const g = PERMISSIONS[key].group;
    groups.set(g, [...(groups.get(g) ?? []), key]);
  }
  return [...groups].map(([group, keys]) => ({ group, keys }));
}
