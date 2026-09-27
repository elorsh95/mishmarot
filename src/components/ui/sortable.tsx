"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { Th } from "./table";

export type SortDir = "asc" | "desc";
export type Sort = { key: string; dir: SortDir } | null;

/**
 * Client-side table sorting. Each key maps to the value to sort by. Clicking a column sorts text
 * A→Z and numbers high→low, a second click reverses, a third returns to the original order.
 */
export function useSort<R>(rows: R[], values: Record<string, (row: R) => string | number>) {
  const [sort, setSort] = useState<Sort>(null);
  const sorted = useMemo(() => {
    const value = sort && values[sort.key];
    if (!sort || !value) return rows;
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const [x, y] = [value(a), value(b)];
      const diff =
        typeof x === "number" && typeof y === "number"
          ? x - y
          : String(x).localeCompare(String(y), "he", { numeric: true });
      return diff * factor;
    });
  }, [rows, values, sort]);

  const toggle = (key: string) => {
    const value = values[key];
    const first: SortDir = rows.length > 0 && typeof value?.(rows[0]) === "number" ? "desc" : "asc";
    setSort((s) =>
      s?.key !== key
        ? { key, dir: first }
        : s.dir === first
          ? { key, dir: first === "asc" ? "desc" : "asc" }
          : null,
    );
  };
  return { sorted, sort, setSort, toggle };
}

/** A header cell that sorts its column; shows the direction and sets aria-sort. */
export function SortTh({
  sortKey,
  sort,
  onSort,
  children,
  className,
  center,
}: {
  sortKey: string;
  sort: Sort;
  onSort: (key: string) => void;
  children: ReactNode;
  className?: string;
  center?: boolean;
}) {
  const active = sort?.key === sortKey ? sort.dir : null;
  const Icon = active === "asc" ? ArrowUp : active === "desc" ? ArrowDown : ArrowUpDown;
  return (
    <Th
      className={cn("p-0", className)}
      aria-sort={active === "asc" ? "ascending" : active === "desc" ? "descending" : undefined}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex w-full items-center gap-1 px-3 py-2.5 hover:text-fg",
          center && "justify-center",
          active && "text-fg",
        )}
      >
        {children}
        <Icon className={cn("h-3 w-3 shrink-0", !active && "opacity-40")} />
      </button>
    </Th>
  );
}
