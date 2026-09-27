"use client";

import { useMemo, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/page-header";
import { SortTh, useSort } from "@/components/ui/sortable";
import { Table, Td } from "@/components/ui/table";
import { WEEKDAY_NAMES } from "@/lib/dates";
import { QUOTA_PERIOD_LABELS } from "@/modules/schedule/types";
import {
  homeDays,
  overQuotaDays,
  shiftAverage,
  type AbsenceReportRow,
  type AgentReportRow,
  type Report,
  type ShiftReportRow,
} from "@/modules/reports/types";

interface Column<R> {
  key: string;
  label: string;
  /** The value to sort by (and to sum in the totals row, when `total` is set). */
  value: (row: R) => string | number;
  cell?: (row: R) => ReactNode;
  /** The totals row cell; omitted means empty. */
  total?: (rows: R[]) => ReactNode;
  className?: string;
}

const sum =
  <R,>(value: (r: R) => number) =>
  (rows: R[]) =>
    rows.reduce((n, r) => n + value(r), 0);

/** A table whose headers sort it (see useSort), with an optional totals row. */
function SortableTable<R>({
  columns,
  rows,
  rowKey,
  rowClassName,
}: {
  columns: Column<R>[];
  rows: R[];
  rowKey: (row: R) => string;
  rowClassName?: (row: R) => string | undefined;
}) {
  const values = useMemo(() => Object.fromEntries(columns.map((c) => [c.key, c.value])), [columns]);
  const { sorted, sort, toggle } = useSort(rows, values);
  const hasTotals = columns.some((c) => c.total);

  return (
    <Table>
      <thead>
        <tr>
          {columns.map((c) => (
            <SortTh
              key={c.key}
              sortKey={c.key}
              sort={sort}
              onSort={toggle}
              className={c.className}
              center={c.className?.includes("text-center")}
            >
              {c.label}
            </SortTh>
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map((r) => (
          <tr key={rowKey(r)} className={rowClassName?.(r)}>
            {columns.map((c) => (
              <Td key={c.key} className={c.className}>
                {c.cell ? c.cell(r) : c.value(r)}
              </Td>
            ))}
          </tr>
        ))}
      </tbody>
      {hasTotals ? (
        <tfoot>
          <tr className="bg-muted/60 font-semibold">
            {columns.map((c, i) => (
              <Td key={c.key} className={c.className}>
                {i === 0 ? "סה״כ" : c.total?.(rows)}
              </Td>
            ))}
          </tr>
        </tfoot>
      ) : null}
    </Table>
  );
}

export function AgentReportTable({ report, showTeam }: { report: Report; showTeam: boolean }) {
  const columns = useMemo(() => {
    const center = "text-center";
    const cols: Column<AgentReportRow>[] = [
      {
        key: "name",
        label: "נציג",
        value: (r) => r.agentName,
        cell: (r) => (
          <span className="font-medium whitespace-nowrap">
            {r.agentName}
            {!r.isActive ? <span className="text-xs font-normal"> (לא פעיל)</span> : null}
          </span>
        ),
      },
      ...(showTeam
        ? [{ key: "team", label: "צוות", value: (r: AgentReportRow) => r.teamName }]
        : []),
      {
        key: "work",
        label: "ימי עבודה",
        value: (r) => r.workDays,
        cell: (r) => <span className="font-semibold">{r.workDays}</span>,
        total: sum((r) => r.workDays),
        className: center,
      },
      ...report.shifts.map((s) => ({
        key: `shift-${s.id}`,
        label: s.name,
        value: (r: AgentReportRow) => r.byShift[s.id] ?? 0,
        total: sum((r: AgentReportRow) => r.byShift[s.id] ?? 0),
        className: center,
      })),
      {
        key: "home",
        label: "ימי בית",
        value: homeDays,
        cell: (r) => (
          <Badge
            tone={overQuotaDays(r) > 0 ? "warning" : "neutral"}
            title={`מכסה: ${r.quota} ימים ${QUOTA_PERIOD_LABELS[report.quotaPeriod].per}`}
          >
            {homeDays(r)}
          </Badge>
        ),
        total: sum(homeDays),
        className: center,
      },
      {
        key: "pending",
        label: "ממתין / נדחה",
        value: (r) => r.home.pending + r.home.rejected,
        cell: (r) => (
          <span className="text-fg-muted">
            {r.home.pending || r.home.rejected ? `${r.home.pending} / ${r.home.rejected}` : "—"}
          </span>
        ),
        total: (rows) =>
          `${sum((r: AgentReportRow) => r.home.pending)(rows)} / ${sum((r: AgentReportRow) => r.home.rejected)(rows)}`,
        className: center,
      },
      ...report.absences.map((a) => ({
        key: `absence-${a.id}`,
        label: a.name,
        value: (r: AgentReportRow) => r.byAbsence[a.id] ?? 0,
        total: sum((r: AgentReportRow) => r.byAbsence[a.id] ?? 0),
        className: center,
      })),
    ];
    return cols;
  }, [report, showTeam]);

  if (report.rows.length === 0) {
    return (
      <Card>
        <EmptyState title="אין נתונים לתקופה זו" />
      </Card>
    );
  }
  return (
    <Card>
      <SortableTable
        columns={columns}
        rows={report.rows}
        rowKey={(r) => `${r.agentId}-${r.teamName}`}
        rowClassName={(r) => (!r.isActive ? "text-fg-muted" : undefined)}
      />
    </Card>
  );
}

export function ShiftReportTables({ report }: { report: Report }) {
  const shiftColumns = useMemo(() => {
    const center = "text-center";
    const locations = report.locations.filter((l) =>
      report.shiftRows.some((r) => r.byLocation[l.id]),
    );
    // Only weekdays that had shifts (usually Saturday drops out).
    const weekdays = WEEKDAY_NAMES.map((_, i) => i).filter((i) =>
      report.shiftRows.some((r) => r.byWeekday[i] > 0),
    );
    const cols: Column<ShiftReportRow>[] = [
      {
        key: "name",
        label: "משמרת",
        value: (r) => r.name,
        cell: (r) => <span className="font-medium">{r.name}</span>,
      },
      {
        key: "total",
        label: "שיבוצים",
        value: (r) => r.total,
        cell: (r) => <span className="font-semibold">{r.total}</span>,
        total: sum((r) => r.total),
        className: center,
      },
      { key: "agents", label: "נציגים", value: (r) => r.agents, className: center },
      { key: "days", label: "ימים", value: (r) => r.days, className: center },
      { key: "avg", label: "ממוצע ליום", value: shiftAverage, className: center },
      ...locations.map((l) => ({
        key: `loc-${l.id}`,
        label: l.name,
        value: (r: ShiftReportRow) => r.byLocation[l.id] ?? 0,
        total: sum((r: ShiftReportRow) => r.byLocation[l.id] ?? 0),
        className: center,
      })),
      ...weekdays.map((i) => ({
        key: `day-${i}`,
        label: WEEKDAY_NAMES[i],
        value: (r: ShiftReportRow) => r.byWeekday[i],
        total: sum((r: ShiftReportRow) => r.byWeekday[i]),
        className: center,
      })),
      {
        key: "pending",
        label: "ממתין / נדחה",
        value: (r) => r.pending + r.rejected,
        cell: (r) => (
          <span className="text-fg-muted">
            {r.pending || r.rejected ? `${r.pending} / ${r.rejected}` : "—"}
          </span>
        ),
        total: (rows) =>
          `${sum((r: ShiftReportRow) => r.pending)(rows)} / ${sum((r: ShiftReportRow) => r.rejected)(rows)}`,
        className: center,
      },
    ];
    return cols;
  }, [report]);

  const absenceColumns: Column<AbsenceReportRow>[] = [
    {
      key: "name",
      label: "סוג היעדרות",
      value: (r) => r.name,
      cell: (r) => <span className="font-medium">{r.name}</span>,
    },
    {
      key: "days",
      label: "ימים",
      value: (r) => r.days,
      total: sum((r) => r.days),
      className: "text-center",
    },
    { key: "agents", label: "נציגים", value: (r) => r.agents, className: "text-center" },
  ];

  if (report.shiftRows.every((r) => r.total === 0) && report.absenceRows.every((r) => !r.days)) {
    return (
      <Card>
        <EmptyState title="אין נתונים לתקופה זו" />
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      <Card>
        <SortableTable columns={shiftColumns} rows={report.shiftRows} rowKey={(r) => r.shiftId} />
      </Card>
      {report.absenceRows.length > 0 ? (
        <div>
          <h2 className="mb-2 text-sm font-semibold">היעדרויות</h2>
          <Card>
            <SortableTable
              columns={absenceColumns}
              rows={report.absenceRows}
              rowKey={(r) => r.absenceTypeId}
            />
          </Card>
        </div>
      ) : null}
    </div>
  );
}
