"use client";

import Link from "next/link";
import { useActionState } from "react";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/form";
import { forgotPasswordAction } from "../auth/actions";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(forgotPasswordAction, {
    sent: false,
    error: null,
  });

  if (state.sent) {
    return (
      <div className="space-y-4 text-center text-sm">
        <MailCheck className="mx-auto h-10 w-10 text-success" />
        <p>אם קיים משתמש פעיל עם כתובת מייל, נשלח אליו קישור לקביעת סיסמה. הקישור תקף לשעה אחת.</p>
        <p className="text-fg-muted">לא הגיע? בדקו בתיקיית הספאם או פנו למנהל המערכת.</p>
        <Link href="/login" className="text-primary hover:underline">
          חזרה להתחברות
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <FormError error={state.error} />
      <p className="text-sm text-fg-muted">
        הזינו את שם המשתמש או כתובת המייל, ונשלח קישור לקביעת סיסמה.
      </p>
      <Field label="שם משתמש או מייל" htmlFor="identifier">
        <Input
          id="identifier"
          name="identifier"
          dir="ltr"
          autoComplete="username"
          required
          autoFocus
        />
      </Field>
      <Button type="submit" className="w-full justify-center" loading={pending}>
        שליחת קישור
      </Button>
      <p className="text-center text-sm">
        <Link href="/login" className="text-primary hover:underline">
          חזרה להתחברות
        </Link>
      </p>
    </form>
  );
}
