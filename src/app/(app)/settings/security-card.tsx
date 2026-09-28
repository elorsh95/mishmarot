"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormError, Select } from "@/components/ui/form";
import { useAction } from "@/components/ui/use-action";
import {
  IDLE_OPTIONS,
  LOCKOUT,
  MFA_POLICY_LABELS,
  SESSION_HOURS,
  type MfaPolicy,
  type SecuritySettings,
} from "@/modules/security/types";
import { updateSecuritySettingsAction } from "./actions";

export function SecuritySettingsCard({
  settings,
  usersWithoutMfa,
}: {
  settings: SecuritySettings;
  /** Active users who haven't set up 2FA (they'll be asked to at their next login). */
  usersWithoutMfa: number;
}) {
  const [idle, setIdle] = useState(String(settings.idleMinutes));
  const [mfa, setMfa] = useState<MfaPolicy>(settings.mfa);
  const { run, pending, error } = useAction();
  const dirty = idle !== String(settings.idleMinutes) || mfa !== settings.mfa;

  return (
    <Card>
      <CardHeader title="אבטחה והתחברות" />
      <CardBody>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(() => updateSecuritySettingsAction({ idleMinutes: idle, mfa }));
          }}
          className="max-w-xl space-y-5"
        >
          <FormError error={error} />
          <Field label="אימות דו-שלבי (קוד מאפליקציה בטלפון)">
            <div className="space-y-2">
              {(Object.keys(MFA_POLICY_LABELS) as MfaPolicy[]).map((p) => (
                <label key={p} className="flex items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name="mfa"
                    checked={mfa === p}
                    onChange={() => setMfa(p)}
                    className="mt-0.5 h-4 w-4 accent-primary"
                  />
                  {MFA_POLICY_LABELS[p]}
                </label>
              ))}
            </div>
            {mfa === "required" && usersWithoutMfa > 0 ? (
              <p className="mt-2 text-xs text-warning-fg">
                {usersWithoutMfa} משתמשים פעילים עוד לא הגדירו אימות דו-שלבי. בכניסה הבאה הם יתבקשו
                להגדיר אותו לפני שימשיכו.
              </p>
            ) : null}
          </Field>
          <Field
            label="ניתוק אוטומטי אחרי חוסר פעילות"
            htmlFor="idle"
            hint="דקה לפני הניתוק מוצגת הודעה עם אפשרות להישאר מחובר. מסכים שמתעדכנים לבד (כמו נוכחות) לא נחשבים פעילות."
          >
            <Select
              id="idle"
              value={idle}
              onChange={(e) => setIdle(e.target.value)}
              className="max-w-48"
            >
              {IDLE_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m < 60 ? `${m} דקות` : m === 60 ? "שעה" : `${m / 60} שעות`}
                </option>
              ))}
            </Select>
          </Field>
          <div className="rounded-lg bg-muted px-3 py-2 text-xs text-fg-muted">
            <p>קבוע במערכת:</p>
            <ul className="mt-1 list-disc space-y-0.5 ps-4">
              <li>
                נעילת חשבון ל-{LOCKOUT.lockMinutes} דקות אחרי {LOCKOUT.maxFailures} ניסיונות כושלים
                (סיסמה או קוד) בתוך {LOCKOUT.windowMinutes} דקות. מנהל מערכת יכול לבטל נעילה במסך
                המשתמשים.
              </li>
              <li>התחברות תקפה עד {SESSION_HOURS} שעות, ואז יש להתחבר מחדש.</li>
              <li>סיסמה: לפחות 8 תווים, עם אות וספרה.</li>
              <li>כל התחברות, ניסיון כושל, נעילה ויציאה נרשמים בלוג הפעולות.</li>
            </ul>
          </div>
          <Button type="submit" loading={pending} disabled={!dirty}>
            שמירה
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
