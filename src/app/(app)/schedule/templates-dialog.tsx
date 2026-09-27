"use client";

import { useEffect, useState } from "react";
import { LayoutTemplate, Save, Trash2 } from "lucide-react";
import { Button, Spinner } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, Input } from "@/components/ui/form";
import { useAction } from "@/components/ui/use-action";
import { formatDateTime } from "@/lib/dates";
import type { SkippedOp } from "@/modules/schedule/engine";
import type { WeekTemplateSummary } from "@/modules/schedule/types";
import {
  applyTemplateAction,
  deleteTemplateAction,
  listTemplatesAction,
  saveTemplateAction,
} from "./actions";

type ApplyResult = { summary: string; skipped: SkippedOp[]; undoToken?: string | null };

/**
 * The team's week templates: save this week under a name, or fill this week's empty days
 * from a saved one.
 */
export function TemplatesDialog({
  teamId,
  weekStart,
  weekLabel,
  canSave,
  onApplied,
  onClose,
}: {
  teamId: string;
  weekStart: string;
  weekLabel: string;
  /** The week has shift entries to save. */
  canSave: boolean;
  onApplied: (result: ApplyResult) => void;
  onClose: () => void;
}) {
  const [templates, setTemplates] = useState<WeekTemplateSummary[] | null>(null);
  const [name, setName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const { run, pending, error, fieldErrors } = useAction();

  const load = () => listTemplatesAction(teamId).then((r) => setTemplates(r.ok ? r.data : []));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per team
  }, [teamId]);

  const existing = templates?.find((t) => t.name === name.trim());

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title="תבניות שבוע"
      description={`שבוע ${weekLabel}. החלת תבנית ממלאת רק ימים ריקים, ואפשר לבטל אותה מיד אחרי.`}
      footer={
        <Button variant="secondary" onClick={onClose}>
          סגירה
        </Button>
      }
    >
      <div className="space-y-5">
        <FormError error={error} />

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">החלת תבנית על השבוע</h3>
          {templates === null ? (
            <Spinner className="text-fg-muted" />
          ) : templates.length === 0 ? (
            <p className="text-sm text-fg-muted">
              עדיין אין תבניות לצוות. שמרו שבוע טוב כתבנית, למשל &quot;שבוע רגיל&quot;.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {templates.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                  <LayoutTemplate className="h-4 w-4 shrink-0 text-fg-muted" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{t.name}</p>
                    <p className="text-xs text-fg-muted">
                      {t.size} שיבוצים · {t.updatedByName}
                      {t.updatedAt ? ` · ${formatDateTime(t.updatedAt)}` : ""}
                    </p>
                  </div>
                  {confirmDelete === t.id ? (
                    <>
                      <span className="text-xs text-danger">למחוק?</span>
                      <Button
                        size="sm"
                        variant="danger"
                        loading={pending}
                        onClick={() =>
                          run(() => deleteTemplateAction(t.id), {
                            onSuccess: () => {
                              setConfirmDelete(null);
                              void load();
                            },
                          })
                        }
                      >
                        מחיקה
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}>
                        ביטול
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        disabled={pending}
                        onClick={() =>
                          run(() => applyTemplateAction(t.id, weekStart), {
                            onSuccess: (data) => {
                              onApplied(data);
                              onClose();
                            },
                          })
                        }
                      >
                        החלה
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`מחיקת התבנית ${t.name}`}
                        onClick={() => setConfirmDelete(t.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2 border-t border-border pt-4">
          <h3 className="text-sm font-semibold">שמירת השבוע הזה כתבנית</h3>
          {canSave ? (
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                run(() => saveTemplateAction(teamId, weekStart, name), {
                  onSuccess: () => {
                    setName("");
                    void load();
                  },
                });
              }}
            >
              <Field
                label="שם התבנית"
                htmlFor="template-name"
                error={fieldErrors._}
                hint={existing ? "קיימת תבנית בשם הזה. השמירה תחליף אותה." : undefined}
                className="min-w-56 flex-1"
              >
                <Input
                  id="template-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="לדוגמה: שבוע רגיל"
                  maxLength={40}
                />
              </Field>
              <Button type="submit" variant="secondary" loading={pending} disabled={!name.trim()}>
                <Save className="h-4 w-4" />
                {existing ? "החלפה" : "שמירה"}
              </Button>
            </form>
          ) : (
            <p className="text-sm text-fg-muted">אין שיבוצי משמרת בשבוע הזה לשמירה.</p>
          )}
          <p className="text-xs text-fg-muted">
            נשמרים שיבוצי המשמרות לפי ימי השבוע (לא היעדרויות). בהחלה מדלגים על נציגים שכבר לא בצוות
            ועל ימים סגורים.
          </p>
        </section>
      </div>
    </Dialog>
  );
}
