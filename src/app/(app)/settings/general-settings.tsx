"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormError, Input } from "@/components/ui/form";
import { useAction } from "@/components/ui/use-action";
import type { Settings } from "@/modules/settings/service";
import { updateSettingsAction } from "./actions";

export function GeneralSettingsCard({ settings }: { settings: Settings }) {
  const [quota, setQuota] = useState(String(settings.defaultMonthlyQuota));
  const { run, pending, error, fieldErrors } = useAction();
  const dirty = quota !== String(settings.defaultMonthlyQuota);

  function save(e: React.FormEvent) {
    e.preventDefault();
    run(() => updateSettingsAction({ defaultMonthlyQuota: quota === "" ? undefined : quota }));
  }

  return (
    <Card>
      <CardHeader title="הגדרות כלליות" />
      <CardBody>
        <form onSubmit={save} className="max-w-xl space-y-4">
          <FormError error={error} />
          <Field
            label="מכסה חודשית ברירת מחדל (ימים)"
            htmlFor="default-quota"
            error={fieldErrors.defaultMonthlyQuota}
            hint="מספר הימים בחודש קלנדרי שנציג יכול לעבוד ממיקום הדורש מכסה (למשל מהבית) ללא אישור. ניתן לקבוע מכסה אישית לכל נציג במסך הנציגים."
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
