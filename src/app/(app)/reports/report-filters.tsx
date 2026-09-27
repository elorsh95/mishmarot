"use client";

import { useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, FileDown } from "lucide-react";
import { Button, Spinner } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { addMonths, formatMonth } from "@/lib/dates";

export function ReportFilters({
  month,
  teamId,
  teams,
}: {
  month: string;
  teamId: string;
  teams: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const query = (next: { month?: string; team?: string }) => {
    const params = new URLSearchParams({ month: next.month ?? month });
    const team = next.team ?? teamId;
    if (team) params.set("team", team);
    return params.toString();
  };
  const go = (next: { month?: string; team?: string }) =>
    startTransition(() => router.replace(`${pathname}?${query(next)}`));

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <Button
          variant="secondary"
          size="icon"
          aria-label="החודש הקודם"
          onClick={() => go({ month: addMonths(month, -1) })}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <span className="min-w-28 text-center font-semibold">{formatMonth(month)}</span>
        <Button
          variant="secondary"
          size="icon"
          aria-label="החודש הבא"
          onClick={() => go({ month: addMonths(month, 1) })}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
      </div>
      {teams.length > 1 ? (
        <Select
          aria-label="צוות"
          value={teamId}
          onChange={(e) => go({ team: e.target.value })}
          className="h-10 w-auto min-w-40"
        >
          <option value="">כל הצוותים</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
      ) : null}
      {pending ? <Spinner className="text-fg-muted" /> : null}
      <a
        href={`/reports/export?${query({})}`}
        className="ms-auto inline-flex h-10 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm font-medium hover:bg-muted"
      >
        <FileDown className="h-4 w-4" />
        ייצוא ל-Excel
      </a>
    </div>
  );
}
