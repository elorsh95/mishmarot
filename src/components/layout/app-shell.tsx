"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  ArrowLeftRight,
  CalendarDays,
  ClipboardCheck,
  History,
  Home,
  KeyRound,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  UserCog,
  Users,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { NavIcon, NavItem } from "./nav-items";

const ICONS: Record<NavIcon, LucideIcon> = {
  home: Home,
  calendar: CalendarDays,
  approvals: ClipboardCheck,
  agents: Users,
  transfers: ArrowLeftRight,
  teams: UsersRound,
  users: UserCog,
  roles: ShieldCheck,
  settings: Settings,
  audit: History,
};

export interface ShellProps {
  items: NavItem[];
  badges: { approvals: { pending: number; urgent: number }; transfers: number };
  user: { fullName: string; roleName: string };
  logout: () => Promise<void>;
  children: ReactNode;
}

export function AppShell({ items, badges, user, logout, children }: ShellProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  const nav = (
    <nav className="flex flex-1 flex-col gap-0.5 p-3">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const count =
          item.badge === "approvals"
            ? badges.approvals.pending
            : item.badge === "transfers"
              ? badges.transfers
              : 0;
        const urgent = item.badge === "approvals" && badges.approvals.urgent > 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              isActive(item.href)
                ? "bg-primary/10 text-primary"
                : "text-fg-muted hover:bg-muted hover:text-fg",
            )}
          >
            <Icon className="h-4.5 w-4.5 shrink-0" />
            <span className="flex-1">{item.label}</span>
            {count > 0 ? (
              <span
                className={cn(
                  "min-w-5 rounded-full px-1.5 text-center text-xs leading-5 font-semibold text-white",
                  urgent ? "animate-pulse bg-danger" : "bg-warning",
                )}
              >
                {count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );

  const footer = (
    <div className="border-t border-border p-3">
      <div className="mb-2 px-3">
        <p className="truncate text-sm font-semibold">{user.fullName}</p>
        <p className="truncate text-xs text-fg-muted">{user.roleName}</p>
      </div>
      <Link
        href="/account"
        onClick={() => setOpen(false)}
        className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-fg-muted hover:bg-muted hover:text-fg"
      >
        <KeyRound className="h-4 w-4" />
        החשבון שלי
      </Link>
      <form action={logout}>
        <button
          type="submit"
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-fg-muted hover:bg-muted hover:text-fg"
        >
          <LogOut className="h-4 w-4" />
          התנתקות
        </button>
      </form>
    </div>
  );

  const brand = (
    <Link href="/" className="flex items-center gap-2 px-5 py-4" onClick={() => setOpen(false)}>
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white">
        <CalendarDays className="h-4.5 w-4.5" />
      </span>
      <span className="text-lg font-bold">משמרות</span>
    </Link>
  );

  return (
    <div className="min-h-screen lg:flex">
      {/* Desktop sidebar (on the right in RTL) */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-e border-border bg-surface lg:flex">
        {brand}
        <div className="flex flex-1 flex-col overflow-y-auto">{nav}</div>
        {footer}
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-surface/95 px-4 py-2 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg p-2 hover:bg-muted"
          aria-label="תפריט"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="font-bold">משמרות</span>
        <span className="w-9" />
      </header>

      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 start-0 flex w-72 max-w-[85vw] flex-col bg-surface shadow-xl">
            <div className="flex items-center justify-between pe-3">
              {brand}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 hover:bg-muted"
                aria-label="סגירה"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex flex-1 flex-col overflow-y-auto">{nav}</div>
            {footer}
          </aside>
        </div>
      ) : null}

      <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">{children}</main>
    </div>
  );
}
