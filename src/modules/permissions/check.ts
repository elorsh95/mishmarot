import { ForbiddenError } from "@/lib/errors";
import type { PermissionKey, PermissionScope, RolePermissions } from "./catalog";

/** What an authorization check needs to know about the acting user. */
export interface Actor {
  id: string;
  fullName: string;
  roleId: string;
  permissions: RolePermissions;
  /** Teams this user manages (from teams.managerIds). */
  managedTeamIds: string[];
}

export function scopeOf(actor: Actor, permission: PermissionKey): PermissionScope | null {
  return actor.permissions[permission] ?? null;
}

export function can(actor: Actor, permission: PermissionKey): boolean {
  return scopeOf(actor, permission) !== null;
}

export function canForTeam(actor: Actor, permission: PermissionKey, teamId: string): boolean {
  const scope = scopeOf(actor, permission);
  if (scope === "all") return true;
  if (scope === "own_teams") return actor.managedTeamIds.includes(teamId);
  return false;
}

export function assertCan(actor: Actor, permission: PermissionKey): void {
  if (!can(actor, permission)) throw new ForbiddenError();
}

export function assertCanForTeam(actor: Actor, permission: PermissionKey, teamId: string): void {
  if (!canForTeam(actor, permission, teamId)) throw new ForbiddenError();
}

/**
 * Team ids the actor may access for a permission.
 * "all" means no restriction; an empty array means no access.
 */
export function teamScope(actor: Actor, permission: PermissionKey): "all" | string[] {
  const scope = scopeOf(actor, permission);
  if (scope === "all") return "all";
  if (scope === "own_teams") return actor.managedTeamIds;
  return [];
}
