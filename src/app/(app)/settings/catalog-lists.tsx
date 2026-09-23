"use client";

import { useState, type ReactNode } from "react";
import { Home, Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, FormError, Input } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/page-header";
import { useAction } from "@/components/ui/use-action";
import { cn } from "@/lib/cn";
import { WEEKDAY_NAMES, WEEKDAY_SHORT } from "@/lib/dates";
import type { AbsenceType, Shift, WorkLocation } from "@/modules/catalog/service";
import { saveAbsenceTypeAction, saveLocationAction, saveShiftAction } from "./actions";

type Editing<T> = T | "new" | null;

interface BaseValues {
  name: string;
  color: string;
  sortOrder: string;
  isActive: boolean;
}

function baseValues(item: BaseItem | null, list: BaseItem[], color: string): BaseValues {
  return {
    name: item?.name ?? "",
    color: item?.color ?? color,
    sortOrder: String(item?.sortOrder ?? Math.max(0, ...list.map((i) => i.sortOrder)) + 1),
    isActive: item?.isActive ?? true,
  };
}

function basePayload(v: BaseValues) {
  return {
    name: v.name,
    color: v.color,
    sortOrder: Number(v.sortOrder) || 0,
    isActive: v.isActive,
  };
}

type BaseItem = { id: string; name: string; color: string; sortOrder: number; isActive: boolean };

export function ShiftsCard({ shifts }: { shifts: Shift[] }) {
  const [editing, setEditing] = useState<Editing<Shift>>(null);
  return (
    <ListCard
      title="משמרות"
      description="המשמרות שניתן לשבץ אליהן נציגים, ובאילו ימים הן פעילות"
      onAdd={() => setEditing("new")}
      items={shifts}
      onEdit={setEditing}
      details={(s) => (
        <>
          <span className="flex gap-0.5" aria-label="ימים">
            {WEEKDAY_SHORT.map((d, i) => (
              <span
                key={d}
                title={WEEKDAY_NAMES[i]}
                className={cn(
                  "inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-semibold",
                  s.daysOfWeek.includes(i) ? "bg-primary/10 text-primary" : "text-fg-subtle",
                )}
              >
                {d.replace("׳", "")}
              </span>
            ))}
          </span>
          {s.coversMorning ? <Badge>בוקר</Badge> : null}
          {s.coversEvening ? <Badge>ערב</Badge> : null}
          {s.requiredAgents != null ? <Badge>נדרשים: {s.requiredAgents}</Badge> : null}
        </>
      )}
    >
      {editing ? (
        <ShiftDialog
          shift={editing === "new" ? null : editing}
          list={shifts}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </ListCard>
  );
}

export function LocationsCard({ locations }: { locations: WorkLocation[] }) {
  const [editing, setEditing] = useState<Editing<WorkLocation>>(null);
  return (
    <ListCard
      title="מיקומי עבודה"
      description="מהיכן הנציג עובד. ימים במיקום הדורש מכסה נספרים במכסה החודשית של הנציג"
      onAdd={() => setEditing("new")}
      items={locations}
      onEdit={setEditing}
      details={(l) =>
        l.requiresQuota ? (
          <Badge tone="warning">
            <Home className="h-3 w-3" />
            דורש מכסה
          </Badge>
        ) : null
      }
    >
      {editing ? (
        <LocationDialog
          location={editing === "new" ? null : editing}
          list={locations}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </ListCard>
  );
}

export function AbsenceTypesCard({ absenceTypes }: { absenceTypes: AbsenceType[] }) {
  const [editing, setEditing] = useState<Editing<AbsenceType>>(null);
  return (
    <ListCard
      title="סוגי היעדרות"
      description="סיבות היעדרות שניתן לסמן בסידור"
      onAdd={() => setEditing("new")}
      items={absenceTypes}
      onEdit={setEditing}
    >
      {editing ? (
        <AbsenceTypeDialog
          absenceType={editing === "new" ? null : editing}
          list={absenceTypes}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </ListCard>
  );
}

function ListCard<T extends BaseItem>({
  title,
  description,
  items,
  onAdd,
  onEdit,
  details,
  children,
}: {
  title: string;
  description: string;
  items: T[];
  onAdd: () => void;
  onEdit: (item: T) => void;
  details?: (item: T) => ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader
        title={title}
        description={description}
        actions={
          <Button size="sm" variant="secondary" onClick={onAdd}>
            <Plus className="h-4 w-4" />
            הוספה
          </Button>
        }
      />
      {items.length === 0 ? (
        <EmptyState title="אין פריטים עדיין" />
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item) => (
            <li
              key={item.id}
              className={cn(
                "flex items-center gap-3 px-4 py-2.5 sm:px-5",
                !item.isActive && "opacity-60",
              )}
            >
              <span
                className="h-4 w-4 shrink-0 rounded-full border border-black/10"
                style={{ backgroundColor: item.color }}
                aria-hidden
              />
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="font-medium">{item.name}</span>
                {details?.(item)}
                {item.isActive ? null : <Badge>לא פעיל</Badge>}
              </div>
              <Button variant="ghost" size="icon" aria-label="עריכה" onClick={() => onEdit(item)}>
                <Pencil className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {children}
    </Card>
  );
}

function ItemDialog({
  title,
  pending,
  error,
  onSave,
  onClose,
  children,
}: {
  title: string;
  pending: boolean;
  error: string | null;
  onSave: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            ביטול
          </Button>
          <Button onClick={onSave} loading={pending}>
            שמירה
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormError error={error} />
        {children}
      </div>
    </Dialog>
  );
}

function NameAndColor({
  values,
  onChange,
  errors,
}: {
  values: BaseValues;
  onChange: (patch: Partial<BaseValues>) => void;
  errors: Record<string, string>;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-3">
      <Field label="שם" htmlFor="item-name" error={errors.name}>
        <Input
          id="item-name"
          value={values.name}
          maxLength={40}
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </Field>
      <Field label="צבע" htmlFor="item-color" error={errors.color}>
        <input
          id="item-color"
          type="color"
          value={values.color}
          onChange={(e) => onChange({ color: e.target.value })}
          className="h-10 w-14 cursor-pointer rounded-lg border border-border bg-surface p-1"
        />
      </Field>
    </div>
  );
}

function OrderAndActive({
  values,
  onChange,
  errors,
}: {
  values: BaseValues;
  onChange: (patch: Partial<BaseValues>) => void;
  errors: Record<string, string>;
}) {
  return (
    <>
      <Field label="סדר תצוגה" htmlFor="item-sort" error={errors.sortOrder}>
        <Input
          id="item-sort"
          type="number"
          inputMode="numeric"
          value={values.sortOrder}
          onChange={(e) => onChange({ sortOrder: e.target.value })}
          className="max-w-32"
        />
      </Field>
      <Field label="סטטוס" hint="פריט לא פעיל לא יוצע לשיבוץ חדש, אך שיבוצים קיימים נשמרים">
        <Checkbox
          label="פעיל"
          checked={values.isActive}
          onChange={(e) => onChange({ isActive: e.target.checked })}
        />
      </Field>
    </>
  );
}

function useBase(item: BaseItem | null, list: BaseItem[], color: string) {
  const [values, setValues] = useState(() => baseValues(item, list, color));
  return [values, (patch: Partial<BaseValues>) => setValues((v) => ({ ...v, ...patch }))] as const;
}

function ShiftDialog({
  shift,
  list,
  onClose,
}: {
  shift: Shift | null;
  list: Shift[];
  onClose: () => void;
}) {
  const [base, setBase] = useBase(shift, list, "#0ea5e9");
  const [days, setDays] = useState<number[]>(shift?.daysOfWeek ?? [0, 1, 2, 3, 4]);
  const [required, setRequired] = useState(
    shift?.requiredAgents != null ? String(shift.requiredAgents) : "",
  );
  const [coversMorning, setCoversMorning] = useState(shift?.coversMorning ?? true);
  const [coversEvening, setCoversEvening] = useState(shift?.coversEvening ?? false);
  const { run, pending, error, fieldErrors } = useAction();

  function toggleDay(day: number) {
    setDays((d) => (d.includes(day) ? d.filter((x) => x !== day) : [...d, day].sort()));
  }

  function save() {
    run(
      () =>
        saveShiftAction(shift?.id ?? null, {
          ...basePayload(base),
          daysOfWeek: days,
          requiredAgents: required === "" ? null : Number(required),
          coversMorning,
          coversEvening,
        }),
      { onSuccess: onClose },
    );
  }

  return (
    <ItemDialog
      title={shift ? `עריכת משמרת: ${shift.name}` : "משמרת חדשה"}
      pending={pending}
      error={error}
      onSave={save}
      onClose={onClose}
    >
      <NameAndColor values={base} onChange={setBase} errors={fieldErrors} />
      <Field label="ימים" error={fieldErrors.daysOfWeek}>
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAY_NAMES.map((name, i) => {
            const selected = days.includes(i);
            return (
              <button
                key={name}
                type="button"
                aria-pressed={selected}
                title={name}
                onClick={() => toggleDay(i)}
                className={cn(
                  "h-9 min-w-9 rounded-lg border px-2 text-sm font-medium transition",
                  selected
                    ? "border-primary bg-primary text-white"
                    : "border-border bg-surface text-fg-muted hover:bg-muted",
                )}
              >
                {WEEKDAY_SHORT[i]}
              </button>
            );
          })}
        </div>
      </Field>
      <Field label="כיסוי" hint="משמרת כפולה מכסה גם בוקר וגם ערב">
        <div className="flex flex-wrap gap-4">
          <Checkbox
            label="בוקר"
            checked={coversMorning}
            onChange={(e) => setCoversMorning(e.target.checked)}
          />
          <Checkbox
            label="ערב"
            checked={coversEvening}
            onChange={(e) => setCoversEvening(e.target.checked)}
          />
        </div>
      </Field>
      <Field
        label="מספר נציגים נדרש ביום"
        htmlFor="shift-required"
        error={fieldErrors.requiredAgents}
        hint="אופציונלי. משמש להתרעה על חוסר בנציגים"
      >
        <Input
          id="shift-required"
          type="number"
          inputMode="numeric"
          min={0}
          value={required}
          placeholder="ללא"
          onChange={(e) => setRequired(e.target.value)}
          className="max-w-32"
        />
      </Field>
      <OrderAndActive values={base} onChange={setBase} errors={fieldErrors} />
    </ItemDialog>
  );
}

function LocationDialog({
  location,
  list,
  onClose,
}: {
  location: WorkLocation | null;
  list: WorkLocation[];
  onClose: () => void;
}) {
  const [base, setBase] = useBase(location, list, "#16a34a");
  const [requiresQuota, setRequiresQuota] = useState(location?.requiresQuota ?? false);
  const { run, pending, error, fieldErrors } = useAction();

  function save() {
    run(() => saveLocationAction(location?.id ?? null, { ...basePayload(base), requiresQuota }), {
      onSuccess: onClose,
    });
  }

  return (
    <ItemDialog
      title={location ? `עריכת מיקום: ${location.name}` : "מיקום עבודה חדש"}
      pending={pending}
      error={error}
      onSave={save}
      onClose={onClose}
    >
      <NameAndColor values={base} onChange={setBase} errors={fieldErrors} />
      <Field
        label="מכסה"
        hint="ימי עבודה במיקום זה (למשל מהבית) נספרים במכסה החודשית של הנציג, ומעבר לה נדרש אישור"
      >
        <Checkbox
          label="דורש מכסה"
          checked={requiresQuota}
          onChange={(e) => setRequiresQuota(e.target.checked)}
        />
      </Field>
      <OrderAndActive values={base} onChange={setBase} errors={fieldErrors} />
    </ItemDialog>
  );
}

function AbsenceTypeDialog({
  absenceType,
  list,
  onClose,
}: {
  absenceType: AbsenceType | null;
  list: AbsenceType[];
  onClose: () => void;
}) {
  const [base, setBase] = useBase(absenceType, list, "#6b7280");
  const { run, pending, error, fieldErrors } = useAction();

  function save() {
    run(() => saveAbsenceTypeAction(absenceType?.id ?? null, basePayload(base)), {
      onSuccess: onClose,
    });
  }

  return (
    <ItemDialog
      title={absenceType ? `עריכת סוג היעדרות: ${absenceType.name}` : "סוג היעדרות חדש"}
      pending={pending}
      error={error}
      onSave={save}
      onClose={onClose}
    >
      <NameAndColor values={base} onChange={setBase} errors={fieldErrors} />
      <OrderAndActive values={base} onChange={setBase} errors={fieldErrors} />
    </ItemDialog>
  );
}
