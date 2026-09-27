"use client";

import { useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, FileDown } from "lucide-react";
import { Button, Spinner } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { todayIso } from "@/lib/dates";
import {
  presetRange,
  REPORT_PERIOD_LABELS,
  reportRangeLabel,
  reportRangeParams,
  stepRange,
  type ReportPeriod,
  type ReportRange,
  type ReportView,
} from "@/modules/reports/period";

const PERIODS: ReportPeriod[] = ["day", "week", "month", "quarter", "range"];
const VIEWS: Array<[ReportView, string]> = [
  ["agents", "לפי נציגים"],
  ["shifts", "לפי משמרות"],
];

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<[T, string]>;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap rounded-lg bg-muted p-1">
      {options.map(([key, text]) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          onClick={() => onChange(key)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium",
            value === key ? "bg-surface shadow-sm" : "text-fg-muted hover:text-fg",
          )}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

export function ReportFilters({
  range,
  view,
  teamId,
  teams,
}: {
  range: ReportRange;
  view: ReportView;
  teamId: string;
  teams: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  const query = (next: { range?: ReportRange; team?: string; view?: ReportView }) => {
    const params = new URLSearchParams(reportRangeParams(next.range ?? range));
    const team = next.team ?? teamId;
    if (team) params.set("team", team);
    const v = next.view ?? view;
    if (v !== "agents") params.set("view", v);
    return params.toString();
  };
  const go = (next: { range?: ReportRange; team?: string; view?: ReportView }) =>
    startTransition(() => router.replace(`${pathname}?${query(next)}`));

  const choosePeriod = (period: ReportPeriod) => {
    if (period === range.period) return;
    // Keep the dates in view: a free range starts as the current one; a preset is taken around
    // today when today is in view, otherwise around the start of the current range.
    const today = todayIso();
    const anchor = today >= range.from && today <= range.to ? today : range.from;
    go({ range: period === "range" ? { ...range, period } : presetRange(period, anchor) });
  };

  return (
    <div className="mb-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="תקופה"
          value={range.period}
          options={PERIODS.map((p) => [p, REPORT_PERIOD_LABELS[p]])}
          onChange={choosePeriod}
        />
        <Segmented label="תצוגה" value={view} options={VIEWS} onChange={(v) => go({ view: v })} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {range.period === "range" ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <Input
              type="date"
              aria-label="מתאריך"
              value={range.from}
              max={range.to}
              onChange={(e) => e.target.value && go({ range: { ...range, from: e.target.value } })}
              className="w-36"
            />
            <span className="text-fg-muted">–</span>
            <Input
              type="date"
              aria-label="עד תאריך"
              value={range.to}
              min={range.from}
              onChange={(e) => e.target.value && go({ range: { ...range, to: e.target.value } })}
              className="w-36"
            />
          </div>
        ) : (
          <PresetStepper range={range} period={range.period} onChange={(r) => go({ range: r })} />
        )}
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
    </div>
  );
}

/** Previous / current / next for a preset period; a single day can also be picked directly. */
function PresetStepper({
  range,
  period,
  onChange,
}: {
  range: ReportRange;
  period: Exclude<ReportPeriod, "range">;
  onChange: (range: ReportRange) => void;
}) {
  return (
    <>
      <div className="flex items-center gap-1">
        <Button
          variant="secondary"
          size="icon"
          aria-label="התקופה הקודמת"
          onClick={() => onChange(stepRange(range, -1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        {period === "day" ? (
          <Input
            type="date"
            aria-label="תאריך"
            value={range.from}
            onChange={(e) => e.target.value && onChange(presetRange("day", e.target.value))}
            className="w-36"
          />
        ) : (
          <span className="min-w-36 text-center font-semibold">{reportRangeLabel(range)}</span>
        )}
        <Button
          variant="secondary"
          size="icon"
          aria-label="התקופה הבאה"
          onClick={() => onChange(stepRange(range, 1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
      </div>
      <Button variant="ghost" size="sm" onClick={() => onChange(presetRange(period, todayIso()))}>
        {period === "day" ? "היום" : "נוכחי"}
      </Button>
    </>
  );
}
