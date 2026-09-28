"use client";

import { useState } from "react";
import { Eraser, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormError, Input } from "@/components/ui/form";
import { useAction } from "@/components/ui/use-action";
import { formatDateTime } from "@/lib/dates";
import {
  RESULT_LABELS,
  RETENTION_LABELS,
  RETENTION_LIMITS,
  type RetentionResult,
  type RetentionSettings,
} from "@/modules/retention/types";
import { previewRetentionAction, runRetentionAction, updateRetentionAction } from "./actions";

type Keys = keyof RetentionSettings;

export function RetentionCard({
  settings,
  lastRunAt,
  lastResult,
}: {
  settings: RetentionSettings;
  lastRunAt: string | null;
  lastResult: RetentionResult | null;
}) {
  const keys = Object.keys(RETENTION_LABELS) as Keys[];
  const [values, setValues] = useState(
    () => Object.fromEntries(keys.map((k) => [k, String(settings[k])])) as Record<Keys, string>,
  );
  const [preview, setPreview] = useState<RetentionResult | null>(null);
  const save = useAction();
  const job = useAction();
  const dirty = keys.some((k) => values[k] !== String(settings[k]));

  return (
    <Card>
      <CardHeader
        title="שמירת מידע ומחיקה"
        description="כמה זמן נשמר כל סוג מידע. מה שישן יותר נמחק אוטומטית כל לילה"
      />
      <CardBody>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save.run(() => updateRetentionAction(values), { onSuccess: () => setPreview(null) });
          }}
          className="space-y-4"
        >
          <FormError error={save.error} />
          <div className="grid gap-4 sm:grid-cols-2">
            {keys.map((k) => (
              <Field
                key={k}
                label={`${RETENTION_LABELS[k].label} (חודשים)`}
                htmlFor={`ret-${k}`}
                hint={RETENTION_LABELS[k].hint}
                error={save.fieldErrors[k]}
              >
                <Input
                  id={`ret-${k}`}
                  type="number"
                  inputMode="numeric"
                  min={RETENTION_LIMITS[k].min}
                  max={RETENTION_LIMITS[k].max}
                  value={values[k]}
                  onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))}
                  className="max-w-32"
                />
              </Field>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={save.pending} disabled={!dirty}>
              שמירה
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={dirty}
              loading={job.pending && !preview}
              onClick={() => job.run(() => previewRetentionAction(), { onSuccess: setPreview })}
              title={dirty ? "יש לשמור קודם" : undefined}
            >
              <Eye className="h-4 w-4" />
              מה יימחק עכשיו?
            </Button>
          </div>
        </form>

        {preview ? (
          <div className="mt-4 rounded-lg border border-border p-3 text-sm">
            <p className="mb-2 font-medium">לפי המדיניות הנוכחית יימחקו:</p>
            <ResultList result={preview} />
            {Object.values(preview).some(Boolean) ? (
              <Button
                variant="danger"
                size="sm"
                className="mt-3"
                loading={job.pending}
                onClick={() => {
                  if (!window.confirm("למחוק עכשיו את כל המידע הישן? אי אפשר לשחזר.")) return;
                  job.run(() => runRetentionAction(), { onSuccess: () => setPreview(null) });
                }}
              >
                <Eraser className="h-4 w-4" />
                מחיקה עכשיו
              </Button>
            ) : null}
          </div>
        ) : null}

        <p className="mt-4 text-xs text-fg-muted">
          {lastRunAt ? `הרצה אחרונה: ${formatDateTime(lastRunAt)}.` : "עוד לא בוצעה הרצה."} המחיקה
          נרשמת בלוג הפעולות. הגיבוי היומי שומר עותקים לתקופה מוגבלת בלבד.
        </p>
        {lastResult && Object.values(lastResult).some(Boolean) ? (
          <div className="mt-2 text-xs text-fg-muted">
            <ResultList result={lastResult} />
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

function ResultList({ result }: { result: RetentionResult }) {
  const rows = (Object.keys(result) as Array<keyof RetentionResult>).filter((k) => result[k]);
  if (rows.length === 0) return <p className="text-fg-muted">אין מידע ישן למחיקה.</p>;
  return (
    <ul className="list-disc space-y-0.5 ps-5">
      {rows.map((k) => (
        <li key={k}>
          {RESULT_LABELS[k]}: <strong>{result[k]}</strong>
        </li>
      ))}
    </ul>
  );
}
