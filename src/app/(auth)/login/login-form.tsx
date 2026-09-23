"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/form";
import { loginAction } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, { error: null });
  return (
    <form action={action} className="space-y-4">
      <FormError error={state.error} />
      <Field label="שם משתמש" htmlFor="username">
        <Input id="username" name="username" autoComplete="username" dir="ltr" required autoFocus />
      </Field>
      <Field label="סיסמה" htmlFor="password">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          dir="ltr"
          required
        />
      </Field>
      <Button type="submit" className="w-full justify-center" loading={pending}>
        התחברות
      </Button>
    </form>
  );
}
