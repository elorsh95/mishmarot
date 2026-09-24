"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormError, Input, Select } from "@/components/ui/form";
import { Table, Td, Th } from "@/components/ui/table";
import { useAction } from "@/components/ui/use-action";
import { formatDateWithDay } from "@/lib/dates";
import {
  DAY_KIND_LABELS,
  type DayInfo,
  type DayKind,
  type SpecialDay,
} from "@/modules/calendar/types";
import { clearSpecialDayAction, setSpecialDayAction } from "./actions";

export interface HolidayRow {
  date: string;
  calendar: DayInfo;
  custom: SpecialDay | null;
}

const KIND_TONE: Record<DayKind, "danger" | "warning" | "neutral"> = {
  closed: "danger",
  eve: "warning",
  regular: "neutral",
};

const KINDS = Object.keys(DAY_KIND_LABELS) as DayKind[];

/**
 * The holiday calendar for the coming year. Every date follows the built-in Israeli calendar
 * unless overridden here (e.g. a Chol HaMoed worked as an eve, or a company day off).
 */
export function HolidaysCard({ rows }: { rows: HolidayRow[] }) {
  const { run, pending, error } = useAction();
  const [date, setDate] = useState("");
  const [kind, setKind] = useState<DayKind>("closed");
  const [name, setName] = useState("");

  function change(row: HolidayRow, next: DayKind | "calendar") {
    if (next === "calendar") run(() => clearSpecialDayAction(row.date));
    else
      run(() => setSpecialDayAction({ date: row.date, kind: next, name: row.custom?.name ?? "" }));
  }

  function add(e: React.FormEvent) {
    e.preventDefault();
    run(() => setSpecialDayAction({ date, kind, name }), {
      onSuccess: () => {
        setDate("");
        setName("");
      },
    });
  }

  return (
    <Card>
      <CardHeader
        title="חגים וימים מיוחדים"
        description="חגי ישראל נקבעים אוטומטית לפי לוח השנה העברי. בחג המוקד סגור, ובערב חג משבצים כמו ביום שישי (בוקר בלבד). אפשר לשנות כל יום, או להוסיף יום מיוחד."
      />
      <CardBody className="space-y-5">
        <FormError error={error} />
        <form onSubmit={add} className="flex flex-wrap items-end gap-3">
          <Field label="תאריך" htmlFor="special-date">
            <Input
              id="special-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-44"
            />
          </Field>
          <Field label="סוג היום" htmlFor="special-kind">
            <Select
              id="special-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as DayKind)}
              className="w-48"
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {DAY_KIND_LABELS[k]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="שם (לא חובה)" htmlFor="special-name">
            <Input
              id="special-name"
              value={name}
              placeholder="למשל: יום גיבוש"
              onChange={(e) => setName(e.target.value)}
              className="w-48"
            />
          </Field>
          <Button type="submit" loading={pending} disabled={!date}>
            הוספה
          </Button>
        </form>

        <div className="max-h-[28rem] overflow-auto rounded-lg border border-border">
          <Table>
            <thead>
              <tr>
                <Th>תאריך</Th>
                <Th>שם</Th>
                <Th>לפי לוח השנה</Th>
                <Th>בפועל</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const effective = row.custom?.kind ?? row.calendar.kind;
                return (
                  <tr key={row.date}>
                    <Td className="whitespace-nowrap">{formatDateWithDay(row.date)}</Td>
                    <Td className="font-medium">{row.custom?.name || row.calendar.name || "—"}</Td>
                    <Td>
                      <Badge tone={KIND_TONE[row.calendar.kind]}>
                        {DAY_KIND_LABELS[row.calendar.kind]}
                      </Badge>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <Select
                          aria-label={`סוג היום ${row.date}`}
                          value={effective}
                          disabled={pending}
                          onChange={(e) => change(row, e.target.value as DayKind)}
                          className="h-9 w-48"
                        >
                          {KINDS.map((k) => (
                            <option key={k} value={k}>
                              {DAY_KIND_LABELS[k]}
                            </option>
                          ))}
                        </Select>
                        {row.custom ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="חזרה ללוח השנה"
                            title={`שונה ע״י ${row.custom.updatedByName}. לחיצה מחזירה ללוח השנה`}
                            disabled={pending}
                            onClick={() => change(row, "calendar")}
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
      </CardBody>
    </Card>
  );
}
