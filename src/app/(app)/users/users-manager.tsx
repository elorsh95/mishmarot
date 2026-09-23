"use client";

import { useState } from "react";
import { KeyRound, Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { Table, Td, Th } from "@/components/ui/table";
import { formatDateTime } from "@/lib/dates";
import type { UserListItem } from "@/modules/users/service";
import { ResetPasswordDialog, UserDialog, type RoleOption, type TeamOption } from "./user-dialogs";

type Dialogs =
  | { kind: "create" }
  | { kind: "edit"; user: UserListItem }
  | { kind: "password"; user: UserListItem }
  | null;

export function UsersManager({
  users,
  roles,
  teams,
  currentUserId,
}: {
  users: UserListItem[];
  roles: RoleOption[];
  teams: TeamOption[];
  currentUserId: string;
}) {
  const [dialog, setDialog] = useState<Dialogs>(null);
  const teamNames = new Map(teams.map((t) => [t.id, t.name]));
  const teamsOf = (u: UserListItem) =>
    u.managedTeamIds.map((id) => teamNames.get(id) ?? id).join(", ");
  const lastLogin = (u: UserListItem) => (u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "—");
  const close = () => setDialog(null);

  return (
    <>
      <PageHeader
        title="משתמשים"
        description="משתמשי המערכת, התפקידים שלהם והצוותים שהם מנהלים"
        actions={
          <Button onClick={() => setDialog({ kind: "create" })}>
            <Plus className="h-4 w-4" />
            משתמש חדש
          </Button>
        }
      />
      <Card>
        {users.length === 0 ? (
          <EmptyState title="אין משתמשים" />
        ) : (
          <>
            <ul className="divide-y divide-border md:hidden">
              {users.map((u) => (
                <li key={u.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{u.fullName}</span>
                      <StatusBadge active={u.isActive} />
                    </div>
                    <p className="text-sm text-fg-muted">
                      <span dir="ltr">{u.username}</span> · {u.roleName}
                    </p>
                    {u.managedTeamIds.length > 0 ? (
                      <p className="text-sm text-fg-muted">מנהל/ת: {teamsOf(u)}</p>
                    ) : null}
                    <p className="text-xs text-fg-subtle">כניסה אחרונה: {lastLogin(u)}</p>
                  </div>
                  <RowActions
                    onEdit={() => setDialog({ kind: "edit", user: u })}
                    onPassword={() => setDialog({ kind: "password", user: u })}
                  />
                </li>
              ))}
            </ul>
            <div className="hidden md:block">
              <Table>
                <thead>
                  <tr>
                    <Th>שם מלא</Th>
                    <Th>שם משתמש</Th>
                    <Th>תפקיד</Th>
                    <Th>צוותים בניהולו</Th>
                    <Th>סטטוס</Th>
                    <Th>כניסה אחרונה</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <Td className="font-medium">{u.fullName}</Td>
                      <Td>
                        <span dir="ltr">{u.username}</span>
                      </Td>
                      <Td>{u.roleName}</Td>
                      <Td className="text-fg-muted">{teamsOf(u) || "—"}</Td>
                      <Td>
                        <StatusBadge active={u.isActive} />
                      </Td>
                      <Td className="whitespace-nowrap text-fg-muted">{lastLogin(u)}</Td>
                      <Td>
                        <RowActions
                          onEdit={() => setDialog({ kind: "edit", user: u })}
                          onPassword={() => setDialog({ kind: "password", user: u })}
                        />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </>
        )}
      </Card>

      {dialog?.kind === "create" ? (
        <UserDialog user={null} roles={roles} teams={teams} isSelf={false} onClose={close} />
      ) : null}
      {dialog?.kind === "edit" ? (
        <UserDialog
          user={dialog.user}
          roles={roles}
          teams={teams}
          isSelf={dialog.user.id === currentUserId}
          onClose={close}
        />
      ) : null}
      {dialog?.kind === "password" ? (
        <ResetPasswordDialog user={dialog.user} onClose={close} />
      ) : null}
    </>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return active ? <Badge tone="success">פעיל</Badge> : <Badge tone="danger">מושבת</Badge>;
}

function RowActions({ onEdit, onPassword }: { onEdit: () => void; onPassword: () => void }) {
  return (
    <div className="flex justify-end gap-1">
      <Button
        variant="ghost"
        size="icon"
        aria-label="איפוס סיסמה"
        title="איפוס סיסמה"
        onClick={onPassword}
      >
        <KeyRound className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" aria-label="עריכה" title="עריכה" onClick={onEdit}>
        <Pencil className="h-4 w-4" />
      </Button>
    </div>
  );
}
