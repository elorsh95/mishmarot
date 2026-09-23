import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { Table, Td, Th } from "@/components/ui/table";
import { formatDateTime } from "@/lib/dates";
import { requireSessionUser } from "@/modules/auth/session";
import { listAudit } from "@/modules/audit/service";
import { AUDIT_ENTITY_LABELS, type AuditEntityType, type AuditEntry } from "@/modules/audit/types";
import { can } from "@/modules/permissions/check";
import { teamsForActor } from "@/modules/teams/service";
import { AuditFilters } from "./audit-filters";

export const metadata: Metadata = { title: "לוג פעולות" };

const LIMIT = 200;

function isEntityType(value: unknown): value is AuditEntityType {
  return typeof value === "string" && value in AUDIT_ENTITY_LABELS;
}

export default async function AuditPage({ searchParams }: PageProps<"/audit">) {
  const user = await requireSessionUser();
  if (!can(user, "audit.view")) notFound();
  const params = await searchParams;
  const teams = await teamsForActor(user, "audit.view", { includeInactive: true });

  const entityType = isEntityType(params.type) ? params.type : undefined;
  const teamId =
    typeof params.team === "string" && teams.some((t) => t.id === params.team)
      ? params.team
      : undefined;
  const entries = await listAudit(user, { entityType, teamId, limit: LIMIT });
  const teamNames = new Map(teams.map((t) => [t.id, t.name]));
  const teamOf = (e: AuditEntry) => (e.teamId ? teamNames.get(e.teamId) : undefined);

  return (
    <>
      <PageHeader
        title="לוג פעולות"
        description={`${LIMIT} הפעולות האחרונות במערכת, מהחדשה לישנה`}
      />
      <AuditFilters
        entityType={entityType ?? ""}
        teamId={teamId ?? ""}
        teams={teams.map((t) => ({ id: t.id, name: t.name }))}
      />
      <Card>
        {entries.length === 0 ? (
          <EmptyState title="לא נמצאו פעולות" description="נסו לשנות את הסינון" />
        ) : (
          <>
            <ul className="divide-y divide-border md:hidden">
              {entries.map((e) => (
                <li key={e.id} className="space-y-1.5 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
                    <span className="whitespace-nowrap">{formatDateTime(e.createdAt)}</span>
                    <Badge>{AUDIT_ENTITY_LABELS[e.entityType] ?? e.entityType}</Badge>
                    {teamOf(e) ? <span>{teamOf(e)}</span> : null}
                  </div>
                  <p className="text-sm break-words">{e.summary}</p>
                  <p className="text-xs text-fg-muted">{e.actorName}</p>
                  <EntryDetails entry={e} />
                </li>
              ))}
            </ul>
            <div className="hidden md:block">
              <Table>
                <thead>
                  <tr>
                    <Th>זמן</Th>
                    <Th>מבצע</Th>
                    <Th>סוג</Th>
                    <Th>צוות</Th>
                    <Th>תיאור</Th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id} className="align-top">
                      <Td className="align-top whitespace-nowrap text-fg-muted">
                        {formatDateTime(e.createdAt)}
                      </Td>
                      <Td className="align-top whitespace-nowrap">{e.actorName}</Td>
                      <Td className="align-top">
                        <Badge>{AUDIT_ENTITY_LABELS[e.entityType] ?? e.entityType}</Badge>
                      </Td>
                      <Td className="align-top whitespace-nowrap text-fg-muted">
                        {teamOf(e) ?? "—"}
                      </Td>
                      <Td className="align-top">
                        <p>{e.summary}</p>
                        <EntryDetails entry={e} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </>
        )}
      </Card>
    </>
  );
}

function EntryDetails({ entry }: { entry: AuditEntry }) {
  if (!entry.before && !entry.after) return null;
  return (
    <details className="group mt-1">
      <summary className="cursor-pointer text-xs font-medium text-primary select-none">
        פרטים
      </summary>
      <div className="mt-2 grid gap-2 lg:grid-cols-2">
        {entry.before ? <JsonBlock label="לפני" value={entry.before} /> : null}
        {entry.after ? <JsonBlock label="אחרי" value={entry.after} /> : null}
      </div>
    </details>
  );
}

function JsonBlock({ label, value }: { label: string; value: Record<string, unknown> }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-xs font-semibold text-fg-muted">{label}</p>
      <pre
        dir="ltr"
        className="max-h-64 overflow-auto rounded-lg bg-muted p-2 text-start text-[11px] leading-relaxed whitespace-pre-wrap break-all"
      >
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
