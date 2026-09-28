"use client";

import { useState } from "react";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/form";
import { useAction } from "@/components/ui/use-action";
import { confirmMfaAction, disableMfaAction, startMfaAction } from "./actions";

/**
 * Two-step verification with an authenticator app: scan the QR code, confirm with a code.
 * Once on, every login asks for a code after the password.
 */
export function MfaSetup({
  enabled,
  required,
  onEnabled,
}: {
  enabled: boolean;
  /** The organization requires 2FA, so it can't be turned off. */
  required: boolean;
  onEnabled?: () => void;
}) {
  const [enrollment, setEnrollment] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState("");
  const [disabling, setDisabling] = useState(false);
  const { run, pending, error } = useAction();

  if (enabled) {
    return (
      <div className="space-y-3">
        <p className="flex items-center gap-2 text-sm">
          <Badge tone="success">
            <ShieldCheck className="h-3.5 w-3.5" />
            מופעל
          </Badge>
          בכל התחברות תתבקשו להזין קוד מאפליקציית האימות.
        </p>
        {required ? (
          <p className="text-xs text-fg-muted">
            אימות דו-שלבי הוא חובה בארגון. אם החלפתם טלפון, מנהל המערכת יכול לאפס אותו.
          </p>
        ) : disabling ? (
          <div className="flex flex-wrap items-end gap-2">
            <Field label="קוד נוכחי מהאפליקציה" htmlFor="mfa-off-code" error={error ?? undefined}>
              <Input
                id="mfa-off-code"
                inputMode="numeric"
                dir="ltr"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-36 text-center tracking-widest"
              />
            </Field>
            <Button
              variant="danger"
              loading={pending}
              onClick={() =>
                run(() => disableMfaAction(code), {
                  onSuccess: () => {
                    setDisabling(false);
                    setCode("");
                  },
                })
              }
            >
              כיבוי
            </Button>
            <Button variant="ghost" onClick={() => setDisabling(false)}>
              ביטול
            </Button>
          </div>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => setDisabling(true)}>
            <ShieldOff className="h-4 w-4" />
            כיבוי אימות דו-שלבי
          </Button>
        )}
      </div>
    );
  }

  if (!enrollment) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-fg-muted">
          שכבת הגנה נוספת: גם מי שיודע את הסיסמה לא יוכל להיכנס בלי הקוד שמתחלף כל 30 שניות
          באפליקציה בטלפון שלכם (Google Authenticator, Microsoft Authenticator או דומה).
        </p>
        <FormError error={error} />
        <Button
          loading={pending}
          onClick={() => run(() => startMfaAction(), { onSuccess: setEnrollment })}
        >
          <ShieldCheck className="h-4 w-4" />
          הפעלת אימות דו-שלבי
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ol className="list-decimal space-y-1 ps-5 text-sm">
        <li>פתחו את אפליקציית האימות בטלפון ובחרו בהוספת חשבון.</li>
        <li>סרקו את הקוד. אם אי אפשר לסרוק, הזינו את המפתח שמתחתיו.</li>
        <li>הזינו את 6 הספרות שהאפליקציה מציגה.</li>
      </ol>
      <div className="flex flex-wrap items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- a generated data URL */}
        <img
          src={enrollment.qr}
          alt="קוד QR לאפליקציית האימות"
          width={180}
          height={180}
          className="rounded-lg border border-border bg-white p-1"
        />
        <div className="min-w-0 text-sm">
          <p className="text-fg-muted">מפתח להזנה ידנית:</p>
          <code
            dir="ltr"
            className="mt-1 block break-all rounded bg-muted px-2 py-1 font-mono text-xs"
          >
            {enrollment.secret.match(/.{1,4}/g)?.join(" ")}
          </code>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="קוד מהאפליקציה" htmlFor="mfa-code" error={error ?? undefined}>
          <Input
            id="mfa-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            dir="ltr"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-36 text-center tracking-widest"
            autoFocus
          />
        </Field>
        <Button
          loading={pending}
          onClick={() =>
            run(() => confirmMfaAction(code), {
              onSuccess: () => {
                setEnrollment(null);
                setCode("");
                onEnabled?.();
              },
            })
          }
        >
          אישור והפעלה
        </Button>
      </div>
    </div>
  );
}
