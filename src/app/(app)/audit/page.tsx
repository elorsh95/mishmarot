import { deniedPage } from "@/modules/access/pages";
import type { Metadata } from "next";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { listAccess, logAccess } from "@/modules/access/service";
import { ACCESS_ACTION_LABELS, type AccessAction } from "@/modules/access/types";
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
  if (!can(user, "audit.view")) await deniedPage(user, "לוג פעולות");
  const params = await searchParams;
  const teams = await teamsForActor(user, "audit.view", { includeInactive: true });
  await logAccess(user, { action: "view", resource: "audit", detail: "לוג פעולות" });

  if (params.log === "access") {
    const action = isAccessAction(params.action) ? params.action : undefined;
    const entries = await listAccess(user, { action, limit: LIMIT });
    return (
      <>
        <PageHeader title="לוג פעולות" description="מי צפה במידע, מי ייצא או הדפיס, וגישה שנדחתה" />
        <LogTabs active="access" />
        <nav aria-label="סינון" className="mb-4 flex flex-wrap gap-1.5">
          {[undefined, ...(Object.keys(ACCESS_ACTION_LABELS) as AccessAction[])].map((a) => (
            <Link
              key={a ?? "all"}
              href={a ? `/audit?log=access&action=${a}` : "/audit?log=access"}
              aria-current={a === action ? "page" : undefined}
              className={cn(
                "rounded-full border px-3 py-1 text-sm",
                a === action
                  ? "border-primary bg-primary text-white"
                  : "border-border bg-surface text-fg-muted hover:text-fg",
              )}
            >
              {a ? ACCESS_ACTION_LABELS[a] : "הכל"}
            </Link>
          ))}
        </nav>
        <Card>
          {entries.length === 0 ? (
            <EmptyState title="אין רשומות" />
          ) : (
            <ul className="divide-y divide-border">
              {entries.map((e) => (
                <li
                  key={e.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm"
                >
                  <span className="w-36 shrink-0 whitespace-nowrap text-xs text-fg-muted">
                    {formatDateTime(e.createdAt)}
                  </span>
                  <Badge
                    tone={
                      e.action === "denied"
                        ? "danger"
                        : e.action === "export"
                          ? "warning"
                          : "neutral"
                    }
                  >
                    {ACCESS_ACTION_LABELS[e.action]}
                  </Badge>
                  <span className="font-medium">{e.actorName}</span>
                  <span className="min-w-0 flex-1 text-fg-muted">{e.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <p className="mt-3 text-xs text-fg-muted">
          צפייה חוזרת של אותו משתמש באותו מסך נרשמת פעם אחת בכל 10 דקות.
        </p>
      </>
    );
  }

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
      <LogTabs active="changes" />
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

function isAccessAction(value: unknown): value is AccessAction {
  return typeof value === "string" && value in ACCESS_ACTION_LABELS;
}

function LogTabs({ active }: { active: "changes" | "access" }) {
  const tabs = [
    { key: "changes", label: "שינויים", href: "/audit" },
    { key: "access", label: "גישה וצפייה", href: "/audit?log=access" },
  ] as const;
  return (
    <nav aria-label="סוג לוג" className="mb-4">
      <div className="inline-flex rounded-lg bg-muted p-1">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            aria-current={t.key === active ? "page" : undefined}
            className={cn(
              "rounded-md px-3.5 py-1.5 text-sm font-medium",
              t.key === active ? "bg-surface shadow-sm" : "text-fg-muted hover:text-fg",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
