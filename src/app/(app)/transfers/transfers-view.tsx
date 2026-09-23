"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Check, Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/page-header";
import { Table, Td, Th } from "@/components/ui/table";
import { useAction } from "@/components/ui/use-action";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/dates";
import {
  TRANSFER_STATUS_LABELS,
  type AgentBrief,
  type TransferRequest,
} from "@/modules/transfers/types";
import { cancelTransferAction, decideTransferAction, requestTransferAction } from "./actions";

interface Props {
  incoming: TransferRequest[];
  outgoing: TransferRequest[];
  history: TransferRequest[];
  candidates: AgentBrief[];
  myTeams: Array<{ id: string; name: string }>;
  teamNames: Record<string, string>;
  userId: string;
}

export function TransfersView({
  incoming,
  outgoing,
  history,
  candidates,
  myTeams,
  teamNames,
  userId,
}: Props) {
  const [creating, setCreating] = useState(false);
  const [deciding, setDeciding] = useState<{
    t: TransferRequest;
    decision: "approved" | "rejected";
  } | null>(null);
  const cancel = useAction();

  const route = (t: TransferRequest) => (
    <span className="inline-flex items-center gap-1.5 text-sm">
      {teamNames[t.fromTeamId] ?? ""}
      <ArrowLeft className="h-3.5 w-3.5 text-fg-subtle" />
      <strong>{teamNames[t.toTeamId] ?? ""}</strong>
    </span>
  );

  return (
    <div className="space-y-5">
      {myTeams.length > 0 ? (
        <div>
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" />
            בקשת העברה חדשה
          </Button>
        </div>
      ) : null}

      <Card>
        <CardHeader
          title="ממתינות לאישורך"
          description="בקשות להעביר נציגים מהצוות שלך לצוות אחר"
        />
        {incoming.length === 0 ? (
          <EmptyState title="אין בקשות ממתינות" />
        ) : (
          <ul className="divide-y divide-border">
            {incoming.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="font-semibold">
                    {t.agentName}{" "}
                    <span className="text-xs font-normal text-fg-subtle">{t.employeeNumber}</span>
                  </p>
                  {route(t)}
                  <p className="text-xs text-fg-muted">
                    ביקש/ה: {t.requestedByName} · {formatDateTime(t.createdAt)}
                  </p>
                  {t.note ? <p className="text-sm">״{t.note}״</p> : null}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="text-danger"
                    onClick={() => setDeciding({ t, decision: "rejected" })}
                  >
                    <X className="h-4 w-4" />
                    דחייה
                  </Button>
                  <Button
                    size="sm"
                    variant="success"
                    onClick={() => setDeciding({ t, decision: "approved" })}
                  >
                    <Check className="h-4 w-4" />
                    אישור
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {outgoing.length > 0 ? (
        <Card>
          <CardHeader title="בקשות ששלחת" description="ממתינות לאישור מנהל הצוות הנוכחי" />
          <ul className="divide-y divide-border">
            {outgoing.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="font-semibold">{t.agentName}</p>
                  {route(t)}
                  <p className="text-xs text-fg-muted">{formatDateTime(t.createdAt)}</p>
                </div>
                {t.requestedBy === userId ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={cancel.pending}
                    onClick={() => cancel.run(() => cancelTransferAction(t.id))}
                  >
                    ביטול הבקשה
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="היסטוריה" />
        {history.length === 0 ? (
          <EmptyState title="אין עדיין העברות" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>נציג</Th>
                <Th>העברה</Th>
                <Th>סטטוס</Th>
                <Th>טופל ע״י</Th>
                <Th>תאריך</Th>
              </tr>
            </thead>
            <tbody>
              {history.map((t) => (
                <tr key={t.id}>
                  <Td className="font-medium whitespace-nowrap">{t.agentName}</Td>
                  <Td className="whitespace-nowrap">{route(t)}</Td>
                  <Td>
                    <Badge
                      tone={
                        t.status === "approved"
                          ? "success"
                          : t.status === "rejected"
                            ? "danger"
                            : "neutral"
                      }
                    >
                      {TRANSFER_STATUS_LABELS[t.status]}
                    </Badge>
                  </Td>
                  <Td className="text-fg-muted">
                    {t.decidedByName ?? "—"}
                    {t.decisionNote ? (
                      <span className="block text-xs">{t.decisionNote}</span>
                    ) : null}
                  </Td>
                  <Td className="whitespace-nowrap text-fg-muted">
                    {formatDateTime(t.decidedAt ?? t.createdAt)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {creating ? (
        <NewTransferDialog
          candidates={candidates}
          myTeams={myTeams}
          onClose={() => setCreating(false)}
        />
      ) : null}
      {deciding ? (
        <DecideDialog {...deciding} teamNames={teamNames} onClose={() => setDeciding(null)} />
      ) : null}
    </div>
  );
}

function NewTransferDialog({
  candidates,
  myTeams,
  onClose,
}: {
  candidates: AgentBrief[];
  myTeams: Array<{ id: string; name: string }>;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [agentId, setAgentId] = useState("");
  const [toTeamId, setToTeamId] = useState(myTeams[0]?.id ?? "");
  const [note, setNote] = useState("");
  const { run, pending, error, fieldErrors } = useAction();

  const matches = useMemo(() => {
    const q = query.trim();
    const list = candidates.filter((c) => c.teamId !== toTeamId);
    if (!q) return list.slice(0, 30);
    return list.filter((c) => c.name.includes(q) || c.employeeNumber.includes(q)).slice(0, 30);
  }, [candidates, query, toTeamId]);

  return (
    <Dialog
      open
      onClose={onClose}
      title="בקשת העברת נציג"
      description="הבקשה תישלח לאישור מנהל הצוות הנוכחי של הנציג"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            ביטול
          </Button>
          <Button
            loading={pending}
            disabled={!agentId}
            onClick={() =>
              run(() => requestTransferAction({ agentId, toTeamId, note }), { onSuccess: onClose })
            }
          >
            שליחת בקשה
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormError error={error} />
        {myTeams.length > 1 ? (
          <Field label="לצוות" error={fieldErrors.toTeamId}>
            <Select value={toTeamId} onChange={(e) => setToTeamId(e.target.value)}>
              {myTeams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field label="נציג" hint="חיפוש לפי שם או מספר עובד" error={fieldErrors.agentId}>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חיפוש…"
            autoFocus
          />
          <ul className="mt-2 max-h-56 divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {matches.length === 0 ? (
              <li className="px-3 py-2 text-sm text-fg-muted">לא נמצאו נציגים</li>
            ) : (
              matches.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setAgentId(c.id)}
                    className={cn(
                      "flex w-full items-center justify-between px-3 py-2 text-start text-sm hover:bg-muted",
                      agentId === c.id && "bg-primary/10",
                    )}
                  >
                    <span>
                      <span className="font-medium">{c.name}</span>{" "}
                      <span className="text-xs text-fg-subtle">{c.employeeNumber}</span>
                    </span>
                    <span className="text-xs text-fg-muted">{c.teamName}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </Field>
        <Field label="הערה למנהל הצוות">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </Field>
      </div>
    </Dialog>
  );
}

function DecideDialog({
  t,
  decision,
  teamNames,
  onClose,
}: {
  t: TransferRequest;
  decision: "approved" | "rejected";
  teamNames: Record<string, string>;
  onClose: () => void;
}) {
  const [note, setNote] = useState("");
  const { run, pending, error } = useAction();
  const approve = decision === "approved";
  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={approve ? "אישור העברה" : "דחיית בקשת העברה"}
      description={`${t.agentName}: ${teamNames[t.fromTeamId] ?? ""} ← ${teamNames[t.toTeamId] ?? ""}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            ביטול
          </Button>
          <Button
            variant={approve ? "success" : "danger"}
            loading={pending}
            onClick={() =>
              run(() => decideTransferAction({ transferId: t.id, decision, note }), {
                onSuccess: onClose,
              })
            }
          >
            {approve ? "אישור" : "דחייה"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <FormError error={error} />
        {approve ? (
          <p className="text-sm text-fg-muted">
            הנציג יעבור מיד לצוות {teamNames[t.toTeamId]}. שיבוצים מהיום והלאה יעברו איתו; שיבוצי
            העבר יישארו בצוות הנוכחי.
          </p>
        ) : null}
        <Field label="הערה (אופציונלי)">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </Field>
      </div>
    </Dialog>
  );
}
