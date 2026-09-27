"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormError, Input, Select } from "@/components/ui/form";
import { useAction } from "@/components/ui/use-action";
import { QUOTA_PERIOD_LABELS, type QuotaPeriod } from "@/modules/schedule/types";
import type { Settings } from "@/modules/settings/service";
import { updateSettingsAction } from "./actions";

export function GeneralSettingsCard({ settings }: { settings: Settings }) {
  const [quota, setQuota] = useState(String(settings.defaultMonthlyQuota));
  const [period, setPeriod] = useState<QuotaPeriod>(settings.quotaPeriod);
  const { run, pending, error, fieldErrors } = useAction();
  const dirty = quota !== String(settings.defaultMonthlyQuota) || period !== settings.quotaPeriod;
  const per = QUOTA_PERIOD_LABELS[period].per;

  function save(e: React.FormEvent) {
    e.preventDefault();
    run(() =>
      updateSettingsAction({
        defaultMonthlyQuota: quota === "" ? undefined : quota,
        quotaPeriod: period,
      }),
    );
  }

  return (
    <Card>
      <CardHeader title="הגדרות כלליות" />
      <CardBody>
        <form onSubmit={save} className="max-w-xl space-y-4">
          <FormError error={error} />
          <Field
            label="תקופת המכסה לעבודה מהבית"
            htmlFor="quota-period"
            hint="האם המכסה נספרת לכל שבוע (ראשון עד שבת) או לכל חודש קלנדרי. בשינוי, המערכת מחשבת מחדש את השיבוצים מהתקופה הנוכחית והלאה: בקשות אישור שכבר לא נדרשות מתבטלות, ונפתחות בקשות חדשות לפי הכלל החדש. תקופות שעברו לא משתנות."
          >
            <Select
              id="quota-period"
              value={period}
              onChange={(e) => setPeriod(e.target.value as QuotaPeriod)}
              className="max-w-48"
            >
              {(Object.keys(QUOTA_PERIOD_LABELS) as QuotaPeriod[]).map((p) => (
                <option key={p} value={p}>
                  מכסה {QUOTA_PERIOD_LABELS[p].adjective}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={`מכסת ברירת מחדל (ימים ${per})`}
            htmlFor="default-quota"
            error={fieldErrors.defaultMonthlyQuota}
            hint={`מספר הימים ${per} שנציג יכול לעבוד ממיקום הדורש מכסה (למשל מהבית) ללא אישור. ניתן לקבוע מכסה אישית לכל נציג במסך הנציגים.`}
          >
            <Input
              id="default-quota"
              type="number"
              inputMode="numeric"
              min={0}
              max={31}
              value={quota}
              onChange={(e) => setQuota(e.target.value)}
              className="max-w-32"
            />
          </Field>
          <Button type="submit" loading={pending} disabled={!dirty}>
            שמירה
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
