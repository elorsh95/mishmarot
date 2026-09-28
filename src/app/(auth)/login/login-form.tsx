"use client";

import { useActionState, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/form";
import { loginAction, type LoginState } from "./actions";

const INITIAL: LoginState = { error: null, step: "password" };

export function LoginForm({ notice }: { notice?: string }) {
  const [state, action, pending] = useActionState(loginAction, INITIAL);
  // "חזרה" from the code step: back to the password until the next submit.
  const [backFrom, setBackFrom] = useState<LoginState | null>(null);
  const step = backFrom === state ? "password" : state.step;

  if (step === "code") {
    return (
      <form action={action} className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg bg-primary/10 p-3 text-sm text-primary">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
          <span>הזינו את הקוד בן 6 הספרות מאפליקציית האימות בטלפון.</span>
        </div>
        <FormError error={state.error} />
        <Field label="קוד אימות" htmlFor="code">
          <Input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]*"
            maxLength={7}
            dir="ltr"
            required
            autoFocus
            className="text-center text-lg tracking-[0.4em]"
          />
        </Field>
        <Button type="submit" className="w-full justify-center" loading={pending}>
          אימות וכניסה
        </Button>
        <button
          type="button"
          className="w-full text-center text-sm text-fg-muted hover:underline"
          onClick={() => setBackFrom(state)}
        >
          חזרה
        </button>
      </form>
    );
  }

  const error = backFrom === state ? null : state.error;
  return (
    <form action={action} className="space-y-4">
      {notice && !error ? (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm text-fg-muted">{notice}</p>
      ) : null}
      <FormError error={error} />
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
