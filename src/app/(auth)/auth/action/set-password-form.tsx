"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/form";
import { setPasswordAction } from "../actions";

export function SetPasswordForm({ oobCode, username }: { oobCode: string; username: string }) {
  const [state, action, pending] = useActionState(setPasswordAction, { error: null });
  return (
    <form action={action} className="space-y-4">
      <FormError error={state.error} />
      <input type="hidden" name="oobCode" value={oobCode} />
      {/* Read-only (not disabled) so password managers save the credentials under this username */}
      <Field label="שם המשתמש שלך" htmlFor="username">
        <Input
          id="username"
          name="username"
          value={username}
          dir="ltr"
          autoComplete="username"
          readOnly
          className="bg-muted"
        />
      </Field>
      <Field label="סיסמה" htmlFor="password" hint="לפחות 8 תווים, כולל אות באנגלית וספרה">
        <Input
          id="password"
          name="password"
          type="password"
          dir="ltr"
          autoComplete="new-password"
          required
          minLength={8}
          autoFocus
        />
      </Field>
      <Field label="אימות סיסמה" htmlFor="confirm">
        <Input
          id="confirm"
          name="confirm"
          type="password"
          dir="ltr"
          autoComplete="new-password"
          required
        />
      </Field>
      <Button type="submit" className="w-full justify-center" loading={pending}>
        שמירה וכניסה למערכת
      </Button>
    </form>
  );
}
