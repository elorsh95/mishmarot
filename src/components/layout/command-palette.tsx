"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CornerDownLeft, FileText, Search, User, UsersRound, type LucideIcon } from "lucide-react";
import { searchIndexAction } from "@/app/(app)/actions";
import { Spinner } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { searchKey, type SearchIndex } from "@/modules/search/types";
import type { NavItem } from "./nav-items";

interface Result {
  key: string;
  icon: LucideIcon;
  label: string;
  detail?: string;
  href: string;
}

const MAX_RESULTS = 12;

/**
 * Quick search (Ctrl+K / ⌘K): jump to an agent's schedule, a team's schedule or any page.
 * The index of teams and agents is loaded the first time it opens.
 */
export function CommandPalette({
  items,
  open,
  onOpenChange,
}: {
  items: NavItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [index, setIndex] = useState<SearchIndex | null>(null);

  // Ctrl+K / ⌘K anywhere toggles it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "ל")) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  // Mounted afresh on every open, so the query starts empty.
  return open ? (
    <PaletteDialog
      items={items}
      index={index}
      onIndex={setIndex}
      onClose={() => onOpenChange(false)}
    />
  ) : null;
}

function PaletteDialog({
  items,
  index,
  onIndex,
  onClose,
}: {
  items: NavItem[];
  /** Loaded the first time the palette opens, then kept by the parent. */
  index: SearchIndex | null;
  onIndex: (index: SearchIndex) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!index) {
      void searchIndexAction().then((r) => onIndex(r.ok ? r.data : { teams: [], agents: [] }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per open
  }, []);

  const results = useMemo<Result[]>(() => {
    const q = searchKey(query);
    const pages: Result[] = items
      .filter((i) => !q || searchKey(i.label).includes(q))
      .map((i) => ({ key: `page:${i.href}`, icon: FileText, label: i.label, href: i.href }));
    if (!q) return pages;
    const teams: Result[] = (index?.teams ?? [])
      .filter((t) => searchKey(t.name).includes(q))
      .map((t) => ({
        key: `team:${t.id}`,
        icon: UsersRound,
        label: `צוות ${t.name}`,
        detail: "סידור עבודה",
        href: `/schedule?team=${t.id}`,
      }));
    const agents: Result[] = (index?.agents ?? [])
      .filter(
        (a) => searchKey(a.name).includes(q) || (a.employeeNumber && a.employeeNumber.includes(q)),
      )
      .map((a) => ({
        key: `agent:${a.id}`,
        icon: User,
        label: a.name,
        detail: [a.teamName, a.employeeNumber, a.isActive ? "" : "לא פעיל"]
          .filter(Boolean)
          .join(" · "),
        href: `/schedule?team=${a.teamId}&agent=${a.id}`,
      }));
    return [...agents, ...teams, ...pages].slice(0, MAX_RESULTS);
  }, [query, index, items]);

  function go(result: Result | undefined) {
    if (!result) return;
    onClose();
    router.push(result.href);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="חיפוש מהיר"
        className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-border px-4">
          <Search className="h-4 w-4 shrink-0 text-fg-subtle" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => Math.min(i + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                go(results[active]);
              } else if (e.key === "Escape") {
                onClose();
              }
            }}
            placeholder="חיפוש נציג, צוות או מסך…"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-results"
            aria-activedescendant={results[active] ? `palette-${results[active].key}` : undefined}
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-fg-subtle"
          />
          {query && !index ? <Spinner className="text-fg-muted" /> : null}
          <kbd className="hidden rounded border border-border px-1.5 text-[11px] text-fg-subtle sm:inline">
            Esc
          </kbd>
        </div>
        <ul id="palette-results" role="listbox" className="max-h-80 overflow-y-auto p-1.5">
          {results.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-fg-muted">לא נמצאו תוצאות</li>
          ) : (
            results.map((r, i) => (
              <li
                key={r.key}
                id={`palette-${r.key}`}
                role="option"
                aria-selected={i === active}
                onMouseMove={() => setActive(i)}
                onClick={() => go(r)}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm",
                  i === active && "bg-primary/10",
                )}
              >
                <r.icon className="h-4 w-4 shrink-0 text-fg-muted" />
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{r.label}</span>
                  {r.detail ? <span className="ms-2 text-xs text-fg-muted">{r.detail}</span> : null}
                </span>
                {i === active ? <CornerDownLeft className="h-3.5 w-3.5 text-fg-subtle" /> : null}
              </li>
            ))
          )}
        </ul>
        {!query ? (
          <p className="border-t border-border px-4 py-2 text-[11px] text-fg-subtle">
            הקלידו שם נציג או מספר עובד כדי לקפוץ לסידור שלו · Ctrl+K לפתיחה מכל מקום
          </p>
        ) : null}
      </div>
    </div>
  );
}
