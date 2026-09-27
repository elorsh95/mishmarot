"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * A button that opens a small dropdown of actions. Closes on outside click, Escape or choosing
 * an item. The panel opens under the button, aligned to its inline end (right in RTL).
 */
export function Menu({
  label,
  icon,
  children,
  className,
}: {
  label: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className={cn("relative", className)}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm font-medium hover:bg-muted",
          open && "bg-muted",
        )}
      >
        {icon}
        {label}
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div
          id={id}
          role="menu"
          onClick={(e) => {
            // Choosing an item (link or button) closes the menu.
            if ((e.target as HTMLElement).closest("[role=menuitem]")) setOpen(false);
          }}
          className="absolute end-0 top-full z-30 mt-1 min-w-60 rounded-xl border border-border bg-surface p-1.5 shadow-lg"
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <p className="px-2.5 pt-1.5 pb-1 text-xs font-semibold text-fg-subtle">{children}</p>;
}

export function MenuSeparator() {
  return <div className="my-1 h-px bg-border" role="separator" />;
}

/** A menu entry: a link (href) or an action (onClick). */
export function MenuItem({
  icon,
  children,
  hint,
  href,
  newTab,
  onClick,
}: {
  icon?: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
  href?: string;
  newTab?: boolean;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className="mt-0.5 text-fg-muted">{icon}</span>
      <span className="flex flex-col text-start">
        <span className="text-sm font-medium">{children}</span>
        {hint ? <span className="text-xs text-fg-muted">{hint}</span> : null}
      </span>
    </>
  );
  const cls = "flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 hover:bg-muted";
  // Plain links: menu entries are downloads and print pages, not in-app navigation.
  if (href) {
    return (
      <a
        role="menuitem"
        href={href}
        className={cls}
        {...(newTab ? { target: "_blank", rel: "noopener" } : {})}
      >
        {body}
      </a>
    );
  }
  return (
    <button role="menuitem" type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  );
}
