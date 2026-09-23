"use client";

import { useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Spinner } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { AUDIT_ENTITY_LABELS, type AuditEntityType } from "@/modules/audit/types";

export function AuditFilters({
  entityType,
  teamId,
  teams,
}: {
  entityType: string;
  teamId: string;
  teams: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  function update(next: { type?: string; team?: string }) {
    const params = new URLSearchParams();
    const type = next.type ?? entityType;
    const team = next.team ?? teamId;
    if (type) params.set("type", type);
    if (team) params.set("team", team);
    const query = params.toString();
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname));
  }

  return (
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <label className="flex min-w-40 flex-1 flex-col gap-1.5 text-sm font-medium sm:max-w-56 sm:flex-none">
        סוג פעולה
        <Select value={entityType} onChange={(e) => update({ type: e.target.value })}>
          <option value="">הכל</option>
          {(Object.keys(AUDIT_ENTITY_LABELS) as AuditEntityType[]).map((t) => (
            <option key={t} value={t}>
              {AUDIT_ENTITY_LABELS[t]}
            </option>
          ))}
        </Select>
      </label>
      {teams.length > 1 ? (
        <label className="flex min-w-40 flex-1 flex-col gap-1.5 text-sm font-medium sm:max-w-56 sm:flex-none">
          צוות
          <Select value={teamId} onChange={(e) => update({ team: e.target.value })}>
            <option value="">כל הצוותים</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </label>
      ) : null}
      {pending ? <Spinner className="mb-3 text-fg-muted" /> : null}
    </div>
  );
}
