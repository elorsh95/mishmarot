"use client";

import { useState, type ReactNode } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, FormError, Input, Select } from "@/components/ui/form";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { Table, Td, Th } from "@/components/ui/table";
import { useAction } from "@/components/ui/use-action";
import type { Team } from "@/modules/teams/service";
import { groupTeams, type Activity } from "@/modules/teams/types";
import { deleteActivityAction, saveActivityAction, saveTeamAction } from "./actions";

type UserBrief = { id: string; fullName: string };

export function TeamsManager({
  teams,
  activities,
  users,
}: {
  teams: Team[];
  activities: Activity[];
  users: UserBrief[];
}) {
  const [editing, setEditing] = useState<Team | "new" | null>(null);
  const [editingActivity, setEditingActivity] = useState<Activity | "new" | null>(null);
  const names = new Map(users.map((u) => [u.id, u.fullName]));
  const managersOf = (t: Team) =>
    t.managerIds.map((id) => names.get(id)).filter((n): n is string => Boolean(n));
  const groups = groupTeams(teams, activities);
  const grouped = activities.length > 0;
  const groupTitle = (a: Activity | null) => (a ? a.name : "ללא פעילות");

  return (
    <>
      <PageHeader
        title="צוותים"
        description="ניהול הצוותים במוקד, מנהלי הצוותים והפעילויות"
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" />
            צוות חדש
          </Button>
        }
      />
      <div className="space-y-4">
        <ActivitiesCard
          activities={activities}
          teams={teams}
          onAdd={() => setEditingActivity("new")}
          onEdit={setEditingActivity}
        />
        <Card>
          {teams.length === 0 ? (
            <EmptyState title="אין צוותים עדיין" description="יש ליצור צוות ראשון" />
          ) : (
            <>
              <div className="md:hidden">
                {groups.map((g) => (
                  <section key={g.activity?.id ?? "none"}>
                    {grouped ? <GroupHeading>{groupTitle(g.activity)}</GroupHeading> : null}
                    <ul className="divide-y divide-border">
                      {g.teams.map((t) => (
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
                  </section>
                ))}
              </div>
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
                  {groups.map((g) => (
                    <tbody key={g.activity?.id ?? "none"}>
                      {grouped ? (
                        <tr>
                          <th
                            colSpan={5}
                            className="border-b border-border bg-muted/40 px-4 py-1.5 text-start text-sm font-semibold"
                          >
                            {groupTitle(g.activity)}
                            <span className="ms-2 text-xs font-normal text-fg-muted">
                              {g.teams.length === 1 ? "צוות אחד" : `${g.teams.length} צוותים`}
                            </span>
                          </th>
                        </tr>
                      ) : null}
                      {g.teams.map((t) => (
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
                  ))}
                </Table>
              </div>
            </>
          )}
        </Card>
      </div>
      {editing ? (
        <TeamDialog
          team={editing === "new" ? null : editing}
          users={users}
          activities={activities}
          nextSortOrder={Math.max(0, ...teams.map((t) => t.sortOrder)) + 1}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {editingActivity ? (
        <ActivityDialog
          activity={editingActivity === "new" ? null : editingActivity}
          teamCount={
            editingActivity === "new"
              ? 0
              : teams.filter((t) => t.activityId === editingActivity.id).length
          }
          nextSortOrder={Math.max(0, ...activities.map((a) => a.sortOrder)) + 1}
          onClose={() => setEditingActivity(null)}
        />
      ) : null}
    </>
  );
}

function GroupHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="border-b border-border bg-muted/40 px-4 py-1.5 text-sm font-semibold">
      {children}
    </h3>
  );
}

/** Activities group teams (lines of business) so they can be viewed together. */
function ActivitiesCard({
  activities,
  teams,
  onAdd,
  onEdit,
}: {
  activities: Activity[];
  teams: Team[];
  onAdd: () => void;
  onEdit: (a: Activity) => void;
}) {
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">פעילויות</h2>
          <p className="text-sm text-fg-muted">
            קבוצה של צוותים שאפשר להציג יחד בסידור, בנוכחות, במסך הראשי ובדוחות. משייכים צוות
            לפעילות בעריכת הצוות.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={onAdd}>
          <Plus className="h-4 w-4" />
          פעילות חדשה
        </Button>
      </div>
      {activities.length === 0 ? (
        <p className="mt-3 text-sm text-fg-muted">אין פעילויות עדיין</p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-2">
          {activities.map((a) => {
            const members = teams.filter((t) => t.activityId === a.id);
            return (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => onEdit(a)}
                  className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-start text-sm hover:bg-muted"
                >
                  <span className="font-medium">{a.name}</span>
                  <span className="text-xs text-fg-muted">
                    {members.length > 0 ? members.map((t) => t.name).join(", ") : "ללא צוותים"}
                  </span>
                  <Pencil className="h-3.5 w-3.5 text-fg-subtle" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function ActivityDialog({
  activity,
  teamCount,
  nextSortOrder,
  onClose,
}: {
  activity: Activity | null;
  teamCount: number;
  nextSortOrder: number;
  onClose: () => void;
}) {
  const [name, setName] = useState(activity?.name ?? "");
  const [sortOrder, setSortOrder] = useState(String(activity?.sortOrder ?? nextSortOrder));
  const { run, pending, error, fieldErrors } = useAction();
  const remove = useAction();

  function save() {
    run(
      () => saveActivityAction(activity?.id ?? null, { name, sortOrder: Number(sortOrder) || 0 }),
      {
        onSuccess: onClose,
      },
    );
  }

  function onDelete() {
    if (!activity) return;
    const note = teamCount > 0 ? ` ${teamCount} הצוותים שבה יישארו ללא פעילות.` : "";
    if (!window.confirm(`למחוק את הפעילות "${activity.name}"?${note}`)) return;
    remove.run(() => deleteActivityAction(activity.id), { onSuccess: onClose });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={activity ? `עריכת פעילות: ${activity.name}` : "פעילות חדשה"}
      footer={
        <>
          {activity ? (
            <Button
              variant="danger"
              onClick={onDelete}
              loading={remove.pending}
              disabled={pending}
              className="me-auto"
            >
              <Trash2 className="h-4 w-4" />
              מחיקה
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onClose} disabled={pending || remove.pending}>
            ביטול
          </Button>
          <Button onClick={save} loading={pending} disabled={remove.pending}>
            שמירה
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormError error={error ?? remove.error} />
        <Field label="שם הפעילות" htmlFor="activity-name" error={fieldErrors.name}>
          <Input
            id="activity-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="למשל: רכב חדש"
          />
        </Field>
        <Field label="סדר תצוגה" htmlFor="activity-sort" error={fieldErrors.sortOrder}>
          <Input
            id="activity-sort"
            type="number"
            inputMode="numeric"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className="max-w-32"
          />
        </Field>
      </div>
    </Dialog>
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
  activities,
  nextSortOrder,
  onClose,
}: {
  team: Team | null;
  users: UserBrief[];
  activities: Activity[];
  nextSortOrder: number;
  onClose: () => void;
}) {
  const [name, setName] = useState(team?.name ?? "");
  const [managerIds, setManagerIds] = useState<string[]>(team?.managerIds ?? []);
  const [sortOrder, setSortOrder] = useState(String(team?.sortOrder ?? nextSortOrder));
  const [isActive, setIsActive] = useState(team?.isActive ?? true);
  const [minMorning, setMinMorning] = useState(String(team?.minMorning ?? 0));
  const [minEvening, setMinEvening] = useState(String(team?.minEvening ?? 0));
  const [activityId, setActivityId] = useState(team?.activityId ?? "");
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
          minMorning: minMorning === "" ? 0 : minMorning,
          minEvening: minEvening === "" ? 0 : minEvening,
          activityId: activityId || null,
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
        {activities.length > 0 ? (
          <Field
            label="פעילות"
            htmlFor="team-activity"
            error={fieldErrors.activityId}
            hint="צוותים באותה פעילות אפשר להציג יחד"
          >
            <Select
              id="team-activity"
              value={activityId}
              onChange={(e) => setActivityId(e.target.value)}
              className="max-w-60"
            >
              <option value="">ללא פעילות</option>
              {activities.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
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
        <Field
          label="מינימום נציגים ביום"
          hint="כמה נציגים צריך בכל יום עבודה. יום עם פחות מזה מסומן במסך הראשי ובסידור. 0 = התראה רק כשאין אף נציג."
          error={fieldErrors.minMorning ?? fieldErrors.minEvening}
        >
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              בוקר
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={99}
                value={minMorning}
                onChange={(e) => setMinMorning(e.target.value)}
                className="w-20"
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              ערב
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={99}
                value={minEvening}
                onChange={(e) => setMinEvening(e.target.value)}
                className="w-20"
              />
            </label>
          </div>
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
