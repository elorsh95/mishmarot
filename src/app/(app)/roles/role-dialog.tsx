"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, Input, Textarea } from "@/components/ui/form";
import { useAction } from "@/components/ui/use-action";
import { cn } from "@/lib/cn";
import {
  PERMISSIONS,
  SCOPE_LABELS,
  SYSTEM_ROLE_IDS,
  type PermissionKey,
  type PermissionScope,
  type RolePermissions,
} from "@/modules/permissions/catalog";
import type { Role } from "@/modules/roles/service";
import { saveRoleAction } from "./actions";

export type PermissionGroup = { group: string; keys: PermissionKey[] };
type Choice = PermissionScope | "none";

export function RoleDialog({
  role,
  groups,
  onClose,
}: {
  role: Role | null;
  groups: PermissionGroup[];
  onClose: () => void;
}) {
  const readOnly = role?.id === SYSTEM_ROLE_IDS.admin;
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [permissions, setPermissions] = useState<RolePermissions>(role?.permissions ?? {});
  const { run, pending, error, fieldErrors } = useAction();

  function setPermission(key: PermissionKey, choice: Choice) {
    setPermissions((p) => {
      const next = { ...p };
      if (choice === "none") delete next[key];
      else next[key] = choice;
      return next;
    });
  }

  function save() {
    run(() => saveRoleAction(role?.id ?? null, { name, description, permissions }), {
      onSuccess: onClose,
    });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={role ? (readOnly ? role.name : `עריכת תפקיד: ${role.name}`) : "תפקיד חדש"}
      footer={
        readOnly ? (
          <Button variant="secondary" onClick={onClose}>
            סגירה
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={pending}>
              ביטול
            </Button>
            <Button onClick={save} loading={pending}>
              שמירה
            </Button>
          </>
        )
      }
    >
      <div className="space-y-4">
        <FormError error={error} />
        {readOnly ? (
          <div className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-fg-muted">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              תפקיד מנהל המערכת מחזיק תמיד בכל ההרשאות, כדי שלא ניתן יהיה לנעול את המערכת. לא ניתן
              לערוך אותו.
            </span>
          </div>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="שם התפקיד" htmlFor="role-name" error={fieldErrors.name}>
            <Input
              id="role-name"
              value={name}
              disabled={readOnly}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="תיאור" htmlFor="role-description" error={fieldErrors.description}>
            <Textarea
              id="role-description"
              value={description}
              disabled={readOnly}
              rows={2}
              className="min-h-10"
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
        </div>
        <div className="space-y-4">
          {groups.map((g) => (
            <section key={g.group} className="rounded-lg border border-border">
              <h3 className="border-b border-border bg-muted/60 px-3 py-2 text-sm font-semibold">
                {g.group}
              </h3>
              <ul className="divide-y divide-border">
                {g.keys.map((key) => (
                  <li
                    key={key}
                    className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="text-sm">{PERMISSIONS[key].label}</span>
                    <ScopeControl
                      scoped={PERMISSIONS[key].scoped}
                      value={permissions[key] ?? "none"}
                      disabled={readOnly}
                      onChange={(c) => setPermission(key, c)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </Dialog>
  );
}

function ScopeControl({
  scoped,
  value,
  disabled,
  onChange,
}: {
  scoped: boolean;
  value: Choice;
  disabled: boolean;
  onChange: (value: Choice) => void;
}) {
  const options: Array<{ value: Choice; label: string }> = scoped
    ? [
        { value: "none", label: "ללא" },
        { value: "own_teams", label: SCOPE_LABELS.own_teams },
        { value: "all", label: SCOPE_LABELS.all },
      ]
    : [
        { value: "none", label: "ללא" },
        { value: "all", label: "פעיל" },
      ];
  const current = !scoped && value === "own_teams" ? "all" : value;

  return (
    <div
      role="radiogroup"
      className="inline-flex shrink-0 flex-wrap self-start rounded-lg border border-border bg-muted p-0.5 sm:self-auto"
    >
      {options.map((o) => {
        const selected = current === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition disabled:cursor-not-allowed",
              selected
                ? o.value === "none"
                  ? "bg-surface text-fg shadow-sm"
                  : "bg-primary text-white shadow-sm"
                : "text-fg-muted hover:text-fg",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
