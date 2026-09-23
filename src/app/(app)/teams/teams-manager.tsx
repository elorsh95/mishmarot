"use client";

import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, FormError, Input } from "@/components/ui/form";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { Table, Td, Th } from "@/components/ui/table";
import { useAction } from "@/components/ui/use-action";
import type { Team } from "@/modules/teams/service";
import { saveTeamAction } from "./actions";

type UserBrief = { id: string; fullName: string };

export function TeamsManager({ teams, users }: { teams: Team[]; users: UserBrief[] }) {
  const [editing, setEditing] = useState<Team | "new" | null>(null);
  const names = new Map(users.map((u) => [u.id, u.fullName]));
  const managersOf = (t: Team) =>
    t.managerIds.map((id) => names.get(id)).filter((n): n is string => Boolean(n));

  return (
    <>
      <PageHeader
        title="צוותים"
        description="ניהול הצוותים במוקד ומנהלי הצוותים"
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" />
            צוות חדש
          </Button>
        }
      />
      <Card>
        {teams.length === 0 ? (
          <EmptyState title="אין צוותים עדיין" description="יש ליצור צוות ראשון" />
        ) : (
          <>
            <ul className="divide-y divide-border md:hidden">
              {teams.map((t) => (
                <li key={t.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{t.name}</span>
                      <StatusBadge active={t.isActive} />
                    </div>
                    <p className="text-sm text-fg-muted">
                      {managersOf(t).join(", ") || "ללא מנהל"}
                    </p>
                  </div>
                  <EditButton onClick={() => setEditing(t)} />
                </li>
              ))}
            </ul>
            <div className="hidden md:block">
              <Table>
                <thead>
                  <tr>
                    <Th>שם הצוות</Th>
                    <Th>מנהלים</Th>
                    <Th>סדר</Th>
                    <Th>סטטוס</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {teams.map((t) => (
                    <tr key={t.id}>
                      <Td className="font-medium">{t.name}</Td>
                      <Td className="text-fg-muted">{managersOf(t).join(", ") || "—"}</Td>
                      <Td className="text-fg-muted">{t.sortOrder}</Td>
                      <Td>
                        <StatusBadge active={t.isActive} />
                      </Td>
                      <Td className="text-end">
                        <EditButton onClick={() => setEditing(t)} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </>
        )}
      </Card>
      {editing ? (
        <TeamDialog
          team={editing === "new" ? null : editing}
          users={users}
          nextSortOrder={Math.max(0, ...teams.map((t) => t.sortOrder)) + 1}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return active ? <Badge tone="success">פעיל</Badge> : <Badge>לא פעיל</Badge>;
}

function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="icon" onClick={onClick} aria-label="עריכה">
      <Pencil className="h-4 w-4" />
    </Button>
  );
}

function TeamDialog({
  team,
  users,
  nextSortOrder,
  onClose,
}: {
  team: Team | null;
  users: UserBrief[];
  nextSortOrder: number;
  onClose: () => void;
}) {
  const [name, setName] = useState(team?.name ?? "");
  const [managerIds, setManagerIds] = useState<string[]>(team?.managerIds ?? []);
  const [sortOrder, setSortOrder] = useState(String(team?.sortOrder ?? nextSortOrder));
  const [isActive, setIsActive] = useState(team?.isActive ?? true);
  const { run, pending, error, fieldErrors } = useAction();

  const knownIds = new Set(users.map((u) => u.id));
  const hiddenManagers = managerIds.filter((id) => !knownIds.has(id));

  function toggleManager(id: string, checked: boolean) {
    setManagerIds((ids) => (checked ? [...ids, id] : ids.filter((x) => x !== id)));
  }

  function save() {
    run(
      () =>
        saveTeamAction(team?.id ?? null, {
          name,
          managerIds,
          sortOrder: Number(sortOrder) || 0,
          isActive,
        }),
      { onSuccess: onClose },
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={team ? `עריכת צוות: ${team.name}` : "צוות חדש"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            ביטול
          </Button>
          <Button onClick={save} loading={pending}>
            שמירה
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormError error={error} />
        <Field label="שם הצוות" htmlFor="team-name" error={fieldErrors.name}>
          <Input id="team-name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field
          label="מנהלי הצוות"
          error={fieldErrors.managerIds}
          hint="ניתן לבחור כמה מנהלים. משתמש יכול לנהל כמה צוותים."
        >
          {users.length === 0 ? (
            <p className="text-sm text-fg-muted">אין משתמשים פעילים</p>
          ) : (
            <div className="grid max-h-56 grid-cols-1 gap-2 overflow-y-auto rounded-lg border border-border p-3 sm:grid-cols-2">
              {users.map((u) => (
                <Checkbox
                  key={u.id}
                  label={u.fullName}
                  checked={managerIds.includes(u.id)}
                  onChange={(e) => toggleManager(u.id, e.target.checked)}
                />
              ))}
            </div>
          )}
          {hiddenManagers.length > 0 ? (
            <p className="text-xs text-fg-muted">
              לצוות משויכים גם {hiddenManagers.length} מנהלים שאינם פעילים
            </p>
          ) : null}
        </Field>
        <Field label="סדר תצוגה" htmlFor="team-sort" error={fieldErrors.sortOrder}>
          <Input
            id="team-sort"
            type="number"
            inputMode="numeric"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className="max-w-32"
          />
        </Field>
        <Checkbox
          label="צוות פעיל"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
        />
      </div>
    </Dialog>
  );
}
