"use client";

import { useState } from "react";
import { Eye, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { FormError } from "@/components/ui/form";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { useAction } from "@/components/ui/use-action";
import {
  PERMISSIONS,
  SCOPE_LABELS,
  SYSTEM_ROLE_IDS,
  type PermissionKey,
} from "@/modules/permissions/catalog";
import type { Role } from "@/modules/roles/service";
import { deleteRoleAction } from "./actions";
import { RoleDialog, type PermissionGroup } from "./role-dialog";

export function RolesManager({ roles, groups }: { roles: Role[]; groups: PermissionGroup[] }) {
  const [editing, setEditing] = useState<Role | "new" | null>(null);
  const [deleting, setDeleting] = useState<Role | null>(null);

  return (
    <>
      <PageHeader
        title="תפקידים והרשאות"
        description="כל משתמש משויך לתפקיד אחד, והתפקיד קובע מה מותר לו לעשות"
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" />
            תפקיד חדש
          </Button>
        }
      />
      {roles.length === 0 ? (
        <Card>
          <EmptyState title="אין תפקידים" />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {roles.map((role) => (
            <RoleCard
              key={role.id}
              role={role}
              onEdit={() => setEditing(role)}
              onDelete={() => setDeleting(role)}
            />
          ))}
        </div>
      )}
      {editing ? (
        <RoleDialog
          role={editing === "new" ? null : editing}
          groups={groups}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {deleting ? <DeleteRoleDialog role={deleting} onClose={() => setDeleting(null)} /> : null}
    </>
  );
}

function RoleCard({
  role,
  onEdit,
  onDelete,
}: {
  role: Role;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isAdmin = role.id === SYSTEM_ROLE_IDS.admin;
  const granted = (Object.keys(role.permissions) as PermissionKey[]).filter(
    (k) => k in PERMISSIONS,
  );

  return (
    <Card className="flex flex-col">
      <CardHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {role.name}
            {role.isSystem ? (
              <Badge tone="primary">
                <Lock className="h-3 w-3" />
                תפקיד מערכת
              </Badge>
            ) : null}
          </span>
        }
        description={role.description || undefined}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={onEdit}>
              {isAdmin ? <Eye className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
              {isAdmin ? "צפייה" : "עריכה"}
            </Button>
            {role.isSystem ? null : (
              <Button
                variant="ghost"
                size="sm"
                className="text-danger"
                onClick={onDelete}
                aria-label="מחיקה"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </>
        }
      />
      <CardBody className="flex-1">
        {isAdmin ? (
          <p className="text-sm text-fg-muted">
            למנהל המערכת יש תמיד את כל ההרשאות, ולא ניתן לשנות אותן.
          </p>
        ) : granted.length === 0 ? (
          <p className="text-sm text-fg-muted">אין הרשאות</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {granted.map((k) => (
              <li key={k}>
                <Badge
                  tone={role.permissions[k] === "own_teams" ? "neutral" : "primary"}
                  title={PERMISSIONS[k].scoped ? SCOPE_LABELS[role.permissions[k]!] : undefined}
                >
                  {PERMISSIONS[k].label}
                  {PERMISSIONS[k].scoped && role.permissions[k] === "own_teams"
                    ? " (הצוותים שלו)"
                    : ""}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function DeleteRoleDialog({ role, onClose }: { role: Role; onClose: () => void }) {
  const { run, pending, error } = useAction();
  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title="מחיקת תפקיד"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            ביטול
          </Button>
          <Button
            variant="danger"
            loading={pending}
            onClick={() => run(() => deleteRoleAction(role.id), { onSuccess: onClose })}
          >
            מחיקה
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <FormError error={error} />
        <p className="text-sm">
          למחוק את התפקיד <strong>{role.name}</strong>? לא ניתן למחוק תפקיד שמשויכים אליו משתמשים.
        </p>
      </div>
    </Dialog>
  );
}
