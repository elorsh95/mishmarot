"use client";

import { useEffect, useState } from "react";
import { Copy, Link2, MessageCircle, RefreshCw } from "lucide-react";
import { Button, Spinner } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormError, Input } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { useAction } from "@/components/ui/use-action";
import { formatDateTime } from "@/lib/dates";
import type { ShareLink } from "@/modules/sharing/types";
import { createShareLinkAction, getShareLinkAction, revokeShareLinkAction } from "./actions";

/**
 * A team's read-only schedule link for agents (no login). Shows published weeks only.
 * Creating a new link replaces the old one, so a leaked link can be cut off.
 */
export function ShareDialog({
  teamId,
  teamName,
  onClose,
}: {
  teamId: string;
  teamName: string;
  onClose: () => void;
}) {
  const [link, setLink] = useState<ShareLink | null | undefined>(undefined);
  const { run, pending, error } = useAction();
  const toast = useToast();

  useEffect(() => {
    getShareLinkAction(teamId).then((r) => setLink(r.ok ? r.data : null));
  }, [teamId]);

  const url = link ? `${window.location.origin}/s/${link.token}` : "";
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(
    `סידור העבודה של צוות ${teamName}:\n${url}`,
  )}`;

  async function copy() {
    await navigator.clipboard.writeText(url);
    toast.success("הקישור הועתק");
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="שיתוף הסידור עם הנציגים"
      description={`קישור לצפייה בלבד בסידור של צוות ${teamName}, בלי צורך במשתמש. מוצגים רק שבועות שפורסמו.`}
      footer={
        <Button variant="secondary" onClick={onClose}>
          סגירה
        </Button>
      }
    >
      <div className="space-y-4">
        <FormError error={error} />
        {link === undefined ? (
          <Spinner className="text-fg-muted" />
        ) : link === null ? (
          <div className="space-y-3">
            <p className="text-sm text-fg-muted">עדיין אין קישור שיתוף לצוות.</p>
            <Button
              loading={pending}
              onClick={() => run(() => createShareLinkAction(teamId), { onSuccess: setLink })}
            >
              <Link2 className="h-4 w-4" />
              יצירת קישור
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input readOnly value={url} dir="ltr" onFocus={(e) => e.target.select()} />
              <Button variant="secondary" onClick={copy} aria-label="העתקה">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#25D366] px-4 text-sm font-medium text-white hover:opacity-90"
              >
                <MessageCircle className="h-4 w-4" />
                שליחה בוואטסאפ
              </a>
              <a
                href={url}
                target="_blank"
                rel="noopener"
                className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted"
              >
                פתיחת הקישור
              </a>
            </div>
            <p className="text-xs text-fg-muted">
              נוצר ע״י {link.createdByName} · {formatDateTime(link.createdAt)}. הקישור נשאר קבוע, כך
              שאפשר לשלוח אותו פעם אחת לקבוצת הצוות. בדף עצמו אפשר לעבור בין שבועות ולשמור את הסידור
              כתמונה.
            </p>
            <div className="flex flex-wrap gap-2 border-t border-border pt-3">
              <Button
                variant="ghost"
                size="sm"
                loading={pending}
                onClick={() =>
                  run(() => createShareLinkAction(teamId), {
                    onSuccess: setLink,
                    success: "נוצר קישור חדש. הקישור הקודם הפסיק לעבוד",
                  })
                }
              >
                <RefreshCw className="h-4 w-4" />
                החלפה בקישור חדש
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-danger"
                disabled={pending}
                onClick={() =>
                  run(() => revokeShareLinkAction(teamId), { onSuccess: () => setLink(null) })
                }
              >
                ביטול הקישור
              </Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
