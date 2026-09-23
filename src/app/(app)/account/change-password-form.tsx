"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/form";
import { useAction } from "@/components/ui/use-action";
import { changePasswordAction } from "./actions";

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [mismatch, setMismatch] = useState(false);
  const { run, pending, error, fieldErrors } = useAction();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirm) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    run(() => changePasswordAction({ currentPassword, newPassword }), {
      onSuccess: () => {
        setCurrentPassword("");
        setNewPassword("");
        setConfirm("");
      },
    });
  }

  return (
    <form onSubmit={submit} className="max-w-sm space-y-4">
      <FormError error={error} />
      <Field label="סיסמה נוכחית" htmlFor="current-password" error={fieldErrors.currentPassword}>
        <Input
          id="current-password"
          type="password"
          dir="ltr"
          autoComplete="current-password"
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
      </Field>
      <Field
        label="סיסמה חדשה"
        htmlFor="new-password"
        error={fieldErrors._}
        hint="לפחות 8 תווים, כולל אות באנגלית וספרה"
      >
        <Input
          id="new-password"
          type="password"
          dir="ltr"
          autoComplete="new-password"
          required
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
      </Field>
      <Field
        label="אימות סיסמה חדשה"
        htmlFor="confirm-password"
        error={mismatch ? "הסיסמאות אינן תואמות" : undefined}
      >
        <Input
          id="confirm-password"
          type="password"
          dir="ltr"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value);
            setMismatch(false);
          }}
        />
      </Field>
      <Button type="submit" loading={pending}>
        עדכון סיסמה
      </Button>
    </form>
  );
}
