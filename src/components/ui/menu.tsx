"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * A button that opens a small dropdown of actions. Closes on outside click, Escape or choosing
 * an item. The panel opens under the button, aligned to its inline end by default; `align="start"`
 * suits a menu at the start of a toolbar (right in RTL).
 */
export function Menu({
  label,
  icon,
  children,
  className,
  align = "end",
  disabled,
}: {
  label: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  align?: "start" | "end";
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();

  // On narrow screens the panel may not fit on its preferred side: nudge it back inside the viewport.
  useLayoutEffect(() => {
    const el = panel.current;
    if (!open || !el) return;
    el.style.translate = "";
    const margin = 8;
    const rect = el.getBoundingClientRect();
    let shift = 0;
    if (rect.left < margin) shift = margin - rect.left;
    else if (rect.right > window.innerWidth - margin)
      shift = window.innerWidth - margin - rect.right;
    if (shift) el.style.translate = `${shift}px 0`;
  }, [open]);

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
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm font-medium hover:bg-muted disabled:pointer-events-none disabled:opacity-50",
          open && "bg-muted",
        )}
      >
        {icon}
        {label}
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div
          ref={panel}
          id={id}
          role="menu"
          onClick={(e) => {
            // Choosing an item (link or button) closes the menu.
            if ((e.target as HTMLElement).closest("[role=menuitem]")) setOpen(false);
          }}
          className={cn(
            "absolute top-full z-30 mt-1 w-max max-w-[calc(100vw-1rem)] min-w-60 rounded-xl border border-border bg-surface p-1.5 shadow-lg",
            align === "end" ? "end-0" : "start-0",
          )}
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
  disabled,
  tone = "default",
}: {
  icon?: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
  href?: string;
  newTab?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "default" | "danger";
}) {
  const body = (
    <>
      <span className={cn("mt-0.5", tone === "danger" ? "text-danger" : "text-fg-muted")}>
        {icon}
      </span>
      <span className="flex flex-col text-start">
        <span className={cn("text-sm font-medium", tone === "danger" && "text-danger")}>
          {children}
        </span>
        {hint ? <span className="text-xs text-fg-muted">{hint}</span> : null}
      </span>
    </>
  );
  const cls =
    "flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 hover:bg-muted disabled:pointer-events-none disabled:opacity-50";
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
    <button role="menuitem" type="button" onClick={onClick} disabled={disabled} className={cls}>
      {body}
    </button>
  );
}
