"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Home, Pencil, Plus, Search, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/page-header";
import { Table, Td, Th } from "@/components/ui/table";
import { useAction } from "@/components/ui/use-action";
import { cn } from "@/lib/cn";
import { WEEKDAY_SHORT } from "@/lib/dates";
import { agentName, type Agent } from "@/modules/agents/types";
import type { Catalog } from "@/modules/catalog/service";
import { saveAgentAction } from "./actions";
import { ImportAgentsDialog } from "./import-dialog";

interface TeamOption {
  id: string;
  name: string;
  isActive: boolean;
}

interface Props {
  agents: Agent[];
  teams: TeamOption[];
  manageTeamIds: string[];
  quotaTeamIds: string[];
  catalog: Catalog;
  defaultQuota: number;
  canRequestTransfer: boolean;
}

export function AgentsView({
  agents,
  teams,
  manageTeamIds,
  quotaTeamIds,
  catalog,
  defaultQuota,
  canRequestTransfer,
}: Props) {
  const [teamFilter, setTeamFilter] = useState("");
  const [query, setQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Agent | "new" | null>(null);
  const [importing, setImporting] = useState(false);

  const teamName = (id: string) => teams.find((t) => t.id === id)?.name ?? "";
  const shiftName = (id: string | null) => catalog.shifts.find((s) => s.id === id)?.name;
  const locationName = (id: string | null) => catalog.locations.find((l) => l.id === id)?.name;

  const visible = useMemo(() => {
    const q = query.trim();
    return agents.filter(
      (a) =>
        (showInactive || a.isActive) &&
        (!teamFilter || a.teamId === teamFilter) &&
        (!q || agentName(a).includes(q) || a.employeeNumber.includes(q)),
    );
  }, [agents, query, showInactive, teamFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חיפוש לפי שם או מספר עובד"
            className="h-9 w-64 ps-9"
          />
        </div>
        {teams.length > 1 ? (
          <Select
            aria-label="צוות"
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className="h-9 w-auto min-w-36"
          >
            <option value="">כל הצוותים</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        ) : null}
        <Checkbox
          label="הצגת לא פעילים"
          checked={showInactive}
          onChange={(e) => setShowInactive(e.target.checked)}
        />
        <div className="ms-auto flex gap-2">
          {canRequestTransfer ? (
            <Link
              href="/transfers"
              className="inline-flex h-10 items-center rounded-lg px-3 text-sm font-medium text-primary hover:bg-muted"
            >
              העברת נציג מצוות אחר
            </Link>
          ) : null}
          {manageTeamIds.length > 0 ? (
            <Button variant="secondary" onClick={() => setImporting(true)}>
              <Upload className="h-4 w-4" />
              ייבוא מקובץ
            </Button>
          ) : null}
          {manageTeamIds.length > 0 ? (
            <Button onClick={() => setEditing("new")}>
              <Plus className="h-4 w-4" />
              נציג חדש
            </Button>
          ) : null}
        </div>
      </div>

      <Card>
        {visible.length === 0 ? (
          <EmptyState title="לא נמצאו נציגים" />
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <thead>
                  <tr>
                    <Th>שם</Th>
                    <Th>מספר עובד</Th>
                    <Th>צוות</Th>
                    <Th>ברירת מחדל</Th>
                    <Th>מכסת בית</Th>
                    <Th>סטטוס</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((a) => (
                    <tr key={a.id} className={cn(!a.isActive && "text-fg-muted")}>
                      <Td className="font-medium">{agentName(a)}</Td>
                      <Td>{a.employeeNumber || "—"}</Td>
                      <Td>{teamName(a.teamId)}</Td>
                      <Td className="text-fg-muted">
                        {shiftName(a.defaultShiftId) ? (
                          <>
                            {shiftName(a.defaultShiftId)} ·{" "}
                            {locationName(a.defaultLocationId) ?? "—"}
                            <span className="block text-xs">
                              {(a.defaultDays ?? []).map((d) => WEEKDAY_SHORT[d]).join(" ")}
                            </span>
                          </>
                        ) : (
                          "—"
                        )}
                      </Td>
                      <Td>
                        <QuotaCell agent={a} defaultQuota={defaultQuota} />
                      </Td>
                      <Td>
                        <Badge tone={a.isActive ? "success" : "neutral"}>
                          {a.isActive ? "פעיל" : "לא פעיל"}
                        </Badge>
                      </Td>
                      <Td className="text-end">
                        {manageTeamIds.includes(a.teamId) ? (
                          <Button size="sm" variant="ghost" onClick={() => setEditing(a)}>
                            <Pencil className="h-4 w-4" />
                            עריכה
                          </Button>
                        ) : null}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
            <ul className="divide-y divide-border md:hidden">
              {visible.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className={cn("font-medium", !a.isActive && "text-fg-muted")}>
                      {agentName(a)}
                      {!a.isActive ? <span className="text-xs"> (לא פעיל)</span> : null}
                    </p>
                    <p className="flex items-center gap-2 text-xs text-fg-muted">
                      {a.employeeNumber ? `${a.employeeNumber} · ` : null}
                      {teamName(a.teamId)}
                      <QuotaCell agent={a} defaultQuota={defaultQuota} />
                    </p>
                  </div>
                  {manageTeamIds.includes(a.teamId) ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setEditing(a)}
                      aria-label="עריכה"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
      <p className="text-xs text-fg-muted">
        {visible.length} נציגים · מכסת ברירת המחדל לעבודה מהבית: {defaultQuota} ימים בחודש
      </p>

      {importing ? (
        <ImportAgentsDialog
          teams={teams.filter((t) => t.isActive && manageTeamIds.includes(t.id))}
          onClose={() => setImporting(false)}
        />
      ) : null}
      {editing ? (
        <AgentDialog
          agent={editing === "new" ? null : editing}
          teams={teams.filter((t) => t.isActive && manageTeamIds.includes(t.id))}
          defaultTeamId={teamFilter || manageTeamIds[0]}
          canSetQuota={(teamId) => quotaTeamIds.includes(teamId)}
          catalog={catalog}
          defaultQuota={defaultQuota}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function QuotaCell({ agent, defaultQuota }: { agent: Agent; defaultQuota: number }) {
  if (agent.monthlyQuota === null) {
    return <span className="text-xs text-fg-muted">{defaultQuota} (ברירת מחדל)</span>;
  }
  return (
    <Badge tone="primary">
      <Home className="h-3 w-3" />
      {agent.monthlyQuota} (אישית)
    </Badge>
  );
}

function AgentDialog({
  agent,
  teams,
  defaultTeamId,
  canSetQuota,
  catalog,
  defaultQuota,
  onClose,
}: {
  agent: Agent | null;
  teams: TeamOption[];
  defaultTeamId: string | undefined;
  canSetQuota: (teamId: string) => boolean;
  catalog: Catalog;
  defaultQuota: number;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    employeeNumber: agent?.employeeNumber ?? "",
    firstName: agent?.firstName ?? "",
    lastName: agent?.lastName ?? "",
    teamId: agent?.teamId ?? defaultTeamId ?? teams[0]?.id ?? "",
    isActive: agent?.isActive ?? true,
    customQuota: agent?.monthlyQuota !== null && agent?.monthlyQuota !== undefined,
    monthlyQuota: String(agent?.monthlyQuota ?? defaultQuota),
    defaultShiftId: agent?.defaultShiftId ?? "",
    defaultLocationId: agent?.defaultLocationId ?? "",
    defaultDays: agent?.defaultDays ?? [0, 1, 2, 3, 4],
    notes: agent?.notes ?? "",
  });
  const { run, pending, error, fieldErrors } = useAction();
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const teamOptions =
    agent && !teams.some((t) => t.id === agent.teamId)
      ? [...teams, { id: agent.teamId, name: "הצוות הנוכחי", isActive: true }]
      : teams;
  const quotaAllowed = canSetQuota(form.teamId);

  function save() {
    run(
      () =>
        saveAgentAction(agent?.id ?? null, {
          employeeNumber: form.employeeNumber,
          firstName: form.firstName,
          lastName: form.lastName,
          teamId: form.teamId,
          isActive: form.isActive,
          monthlyQuota: form.customQuota ? Number(form.monthlyQuota) : null,
          defaultShiftId: form.defaultShiftId || null,
          defaultLocationId: form.defaultLocationId || null,
          defaultDays: form.defaultDays,
          notes: form.notes,
        }),
      { onSuccess: onClose },
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={agent ? `עריכת נציג: ${agentName(agent)}` : "נציג חדש"}
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
      <div className="space-y-5">
        <FormError error={error} />
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="שם פרטי" htmlFor="firstName" error={fieldErrors.firstName}>
            <Input
              id="firstName"
              value={form.firstName}
              onChange={(e) => set("firstName", e.target.value)}
            />
          </Field>
          <Field label="שם משפחה" htmlFor="lastName" error={fieldErrors.lastName}>
            <Input
              id="lastName"
              value={form.lastName}
              onChange={(e) => set("lastName", e.target.value)}
            />
          </Field>
          <Field
            label="מספר עובד (לא חובה)"
            htmlFor="employeeNumber"
            error={fieldErrors.employeeNumber}
          >
            <Input
              id="employeeNumber"
              dir="ltr"
              value={form.employeeNumber}
              onChange={(e) => set("employeeNumber", e.target.value)}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="צוות"
            htmlFor="teamId"
            error={fieldErrors.teamId}
            hint={agent ? "להעברה לצוות שאינו בניהולך יש לשלוח בקשת העברה" : undefined}
          >
            <Select
              id="teamId"
              value={form.teamId}
              onChange={(e) => set("teamId", e.target.value)}
              disabled={teamOptions.length <= 1}
            >
              {teamOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex items-end pb-2">
            <Checkbox
              label="נציג פעיל"
              checked={form.isActive}
              onChange={(e) => set("isActive", e.target.checked)}
            />
          </div>
        </div>

        <fieldset className="space-y-3 rounded-xl border border-border p-4">
          <legend className="px-1 text-sm font-semibold">מכסת עבודה מהבית</legend>
          {quotaAllowed ? (
            <>
              <Checkbox
                label={`מכסה אישית (במקום ברירת המחדל: ${defaultQuota} ימים בחודש)`}
                checked={form.customQuota}
                onChange={(e) => set("customQuota", e.target.checked)}
              />
              {form.customQuota ? (
                <Field
                  label="ימים בחודש קלנדרי"
                  htmlFor="quota"
                  error={fieldErrors.monthlyQuota}
                  className="max-w-40"
                >
                  <Input
                    id="quota"
                    type="number"
                    min={0}
                    max={31}
                    value={form.monthlyQuota}
                    onChange={(e) => set("monthlyQuota", e.target.value)}
                  />
                </Field>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-fg-muted">
              {agent?.monthlyQuota !== null && agent?.monthlyQuota !== undefined
                ? `מכסה אישית: ${agent.monthlyQuota} ימים בחודש`
                : `ברירת מחדל: ${defaultQuota} ימים בחודש`}
              . שינוי המכסה נעשה ע״י מנהלת המוקד.
            </p>
          )}
        </fieldset>

        <fieldset className="space-y-3 rounded-xl border border-border p-4">
          <legend className="px-1 text-sm font-semibold">ברירת מחדל לסידור</legend>
          <p className="text-xs text-fg-muted">
            משמשת את הכפתור ״מילוי לפי ברירת מחדל״ בסידור השבועי
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="משמרת קבועה" htmlFor="defaultShift">
              <Select
                id="defaultShift"
                value={form.defaultShiftId}
                onChange={(e) => set("defaultShiftId", e.target.value)}
              >
                <option value="">ללא</option>
                {catalog.shifts
                  .filter((s) => s.isActive || s.id === form.defaultShiftId)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="מיקום קבוע" htmlFor="defaultLocation">
              <Select
                id="defaultLocation"
                value={form.defaultLocationId}
                onChange={(e) => set("defaultLocationId", e.target.value)}
              >
                <option value="">ללא</option>
                {catalog.locations
                  .filter((l) => l.isActive || l.id === form.defaultLocationId)
                  .map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
              </Select>
            </Field>
          </div>
          <Field label="ימי עבודה קבועים">
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAY_SHORT.slice(0, 6).map((label, day) => {
                const on = form.defaultDays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      set(
                        "defaultDays",
                        on
                          ? form.defaultDays.filter((d) => d !== day)
                          : [...form.defaultDays, day].sort(),
                      )
                    }
                    className={cn(
                      "h-9 w-10 rounded-lg border text-sm font-medium",
                      on
                        ? "border-primary bg-primary text-white"
                        : "border-border bg-surface text-fg-muted",
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </Field>
        </fieldset>

        <Field label="הערות" htmlFor="notes">
          <Textarea id="notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}
