"use client";

import { useState } from "react";
import { KeyRound, Mail, Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { Table, Td, Th } from "@/components/ui/table";
import { useAction } from "@/components/ui/use-action";
import { formatDateTime } from "@/lib/dates";
import type { UserListItem } from "@/modules/users/service";
import { sendPasswordLinkAction } from "./actions";
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
  const linkAction = useAction();
  const sendLink = (u: UserListItem) =>
    linkAction.run(() => sendPasswordLinkAction(u.id), {
      success: u.passwordSetAt
        ? `נשלח קישור לאיפוס סיסמה ל-${u.email}`
        : `ההזמנה נשלחה שוב ל-${u.email}`,
    });
  const actions = (u: UserListItem) => (
    <RowActions
      user={u}
      busy={linkAction.pending}
      onEdit={() => setDialog({ kind: "edit", user: u })}
      onPassword={() => setDialog({ kind: "password", user: u })}
      onSendLink={() => sendLink(u)}
    />
  );

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
                      <StatusBadge user={u} />
                    </div>
                    <p className="text-sm text-fg-muted">
                      <span dir="ltr">{u.username}</span> · {u.roleName}
                    </p>
                    {u.email ? (
                      <p className="text-sm text-fg-muted" dir="ltr">
                        {u.email}
                      </p>
                    ) : null}
                    {u.managedTeamIds.length > 0 ? (
                      <p className="text-sm text-fg-muted">מנהל/ת: {teamsOf(u)}</p>
                    ) : null}
                    <p className="text-xs text-fg-subtle">כניסה אחרונה: {lastLogin(u)}</p>
                  </div>
                  {actions(u)}
                </li>
              ))}
            </ul>
            <div className="hidden md:block">
              <Table>
                <thead>
                  <tr>
                    <Th>שם מלא</Th>
                    <Th>שם משתמש</Th>
                    <Th>מייל</Th>
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
                      <Td className="text-fg-muted">
                        <span dir="ltr">{u.email ?? "—"}</span>
                      </Td>
                      <Td>{u.roleName}</Td>
                      <Td className="text-fg-muted">{teamsOf(u) || "—"}</Td>
                      <Td>
                        <StatusBadge user={u} />
                      </Td>
                      <Td className="whitespace-nowrap text-fg-muted">{lastLogin(u)}</Td>
                      <Td>{actions(u)}</Td>
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

function StatusBadge({ user }: { user: UserListItem }) {
  if (!user.isActive) return <Badge tone="danger">מושבת</Badge>;
  if (!user.passwordSetAt && !user.lastLoginAt) return <Badge tone="warning">ממתין להפעלה</Badge>;
  return <Badge tone="success">פעיל</Badge>;
}

function RowActions({
  user,
  busy,
  onEdit,
  onPassword,
  onSendLink,
}: {
  user: UserListItem;
  busy: boolean;
  onEdit: () => void;
  onPassword: () => void;
  onSendLink: () => void;
}) {
  const invite = !user.passwordSetAt && !user.lastLoginAt;
  const linkLabel = invite ? "שליחת ההזמנה מחדש" : "שליחת קישור לאיפוס סיסמה";
  return (
    <div className="flex justify-end gap-1">
      {user.email && user.isActive ? (
        <Button
          variant="ghost"
          size="icon"
          aria-label={linkLabel}
          title={linkLabel}
          disabled={busy}
          onClick={onSendLink}
        >
          <Mail className="h-4 w-4" />
        </Button>
      ) : null}
      <Button
        variant="ghost"
        size="icon"
        aria-label="הגדרת סיסמה ידנית"
        title="הגדרת סיסמה ידנית"
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
