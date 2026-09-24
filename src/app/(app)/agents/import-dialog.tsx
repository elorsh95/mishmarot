"use client";

import { useState } from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, Select } from "@/components/ui/form";
import { Table, Td, Th } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { useAction } from "@/components/ui/use-action";
import type { AgentImportResult, AgentImportRow } from "@/modules/agents/types";
import { importAgentsAction } from "./actions";

const STATUS: Record<
  AgentImportRow["status"],
  { label: string; tone: "success" | "neutral" | "danger" }
> = {
  new: { label: "יתווסף", tone: "success" },
  exists: { label: "קיים", tone: "neutral" },
  error: { label: "שגיאה", tone: "danger" },
};

export function ImportAgentsDialog({
  teams,
  onClose,
}: {
  teams: Array<{ id: string; name: string }>;
  onClose: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [defaultTeamId, setDefaultTeamId] = useState(teams.length === 1 ? teams[0].id : "");
  const [preview, setPreview] = useState<AgentImportResult | null>(null);
  const { run, pending, error } = useAction();
  const toast = useToast();

  const counts = { new: 0, exists: 0, error: 0 };
  for (const r of preview?.rows ?? []) counts[r.status]++;

  function send(dryRun: boolean) {
    if (!file) return;
    const form = new FormData();
    form.set("file", file);
    form.set("defaultTeamId", defaultTeamId);
    form.set("dryRun", dryRun ? "1" : "0");
    run(() => importAgentsAction(form), {
      onSuccess: (result) => {
        if (dryRun) {
          setPreview(result);
        } else {
          toast.success(`נוספו ${result.created} נציגים`);
          onClose();
        }
      },
    });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title="ייבוא נציגים מקובץ"
      description="קובץ Excel (xlsx) או CSV עם עמודות: שם פרטי, שם משפחה, צוות ומספר עובד (לא חובה)"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            ביטול
          </Button>
          {preview && counts.new > 0 ? (
            <Button onClick={() => send(false)} loading={pending}>
              ייבוא {counts.new} נציגים
            </Button>
          ) : (
            <Button onClick={() => send(true)} loading={pending} disabled={!file}>
              בדיקת הקובץ
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <FormError error={error} />
        <a
          href="/agents/template"
          className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
        >
          <Download className="h-4 w-4" />
          הורדת תבנית Excel
        </a>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="קובץ" htmlFor="import-file">
            <label
              htmlFor="import-file"
              className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 text-sm hover:bg-muted"
            >
              <FileSpreadsheet className="h-4 w-4 shrink-0 text-fg-muted" />
              <span className="truncate">{file?.name ?? "בחירת קובץ…"}</span>
            </label>
            <input
              id="import-file"
              type="file"
              accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setPreview(null);
              }}
            />
          </Field>
          {teams.length > 1 ? (
            <Field
              label="צוות לשורות בלי צוות"
              htmlFor="import-team"
              hint="לשורות שבהן עמודת הצוות ריקה"
            >
              <Select
                id="import-team"
                value={defaultTeamId}
                onChange={(e) => {
                  setDefaultTeamId(e.target.value);
                  setPreview(null);
                }}
              >
                <option value="">ללא</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
        </div>

        {preview ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge tone="success">{counts.new} יתווספו</Badge>
              {counts.exists > 0 ? <Badge tone="neutral">{counts.exists} כבר קיימים</Badge> : null}
              {counts.error > 0 ? <Badge tone="danger">{counts.error} עם שגיאות</Badge> : null}
            </div>
            {counts.error > 0 ? (
              <p className="text-sm text-fg-muted">
                שורות עם שגיאות לא ייובאו. אפשר לתקן את הקובץ ולבדוק שוב, או לייבא רק את השורות
                התקינות.
              </p>
            ) : null}
            <div className="max-h-80 overflow-auto rounded-lg border border-border">
              <Table>
                <thead>
                  <tr>
                    <Th>שורה</Th>
                    <Th>שם</Th>
                    <Th>צוות</Th>
                    <Th>מספר עובד</Th>
                    <Th>סטטוס</Th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.line}>
                      <Td className="text-fg-muted">{r.line}</Td>
                      <Td className="font-medium">
                        {`${r.firstName} ${r.lastName}`.trim() || "—"}
                      </Td>
                      <Td>{r.teamName || "—"}</Td>
                      <Td>{r.employeeNumber || "—"}</Td>
                      <Td>
                        <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                        {r.message && r.status === "error" ? (
                          <span className="ms-2 text-xs text-danger">{r.message}</span>
                        ) : null}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
