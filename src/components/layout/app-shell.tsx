"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  ArrowLeftRight,
  CalendarDays,
  ClipboardCheck,
  History,
  FileSpreadsheet,
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
import { BrandMark } from "@/components/brand";
import type { Theme } from "@/components/theme";
import { ThemeSwitch } from "@/components/theme-switch";
import { cn } from "@/lib/cn";
import { NAV_GROUP_LABELS, type NavGroup, type NavIcon, type NavItem } from "./nav-items";

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
  reports: FileSpreadsheet,
  audit: History,
};

export interface ShellProps {
  items: NavItem[];
  badges: { approvals: { pending: number; urgent: number }; transfers: number };
  user: { fullName: string; roleName: string };
  logout: () => Promise<void>;
  /** The company logo (settings), shown instead of the app mark. */
  logoUrl: string | null;
  theme: Theme;
  children: ReactNode;
}

export function AppShell({ items, badges, user, logout, logoUrl, theme, children }: ShellProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  const countOf = (item: NavItem) =>
    item.badge === "approvals"
      ? badges.approvals.pending
      : item.badge === "transfers"
        ? badges.transfers
        : 0;
  const waiting = items.some((item) => countOf(item) > 0);

  const link = (item: NavItem) => {
    const Icon = ICONS[item.icon];
    const count = countOf(item);
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
        {count > 0 ? <CountBadge count={count} urgent={urgent} /> : null}
      </Link>
    );
  };
  const groups = (Object.keys(NAV_GROUP_LABELS) as NavGroup[])
    .map((group) => ({ group, items: items.filter((i) => i.group === group) }))
    .filter((g) => g.items.length > 0);
  const nav = (
    <nav className="flex flex-1 flex-col gap-4 p-3">
      {groups.map(({ group, items: groupItems }) => (
        <div key={group} className="flex flex-col gap-0.5">
          {groups.length > 1 ? (
            <p className="px-3 pb-1 text-[11px] font-semibold tracking-wide text-fg-subtle">
              {NAV_GROUP_LABELS[group]}
            </p>
          ) : null}
          {groupItems.map(link)}
        </div>
      ))}
    </nav>
  );

  const footer = (
    <div className="border-t border-border p-3">
      <div className="mb-2 px-3">
        <p className="truncate text-sm font-semibold">{user.fullName}</p>
        <p className="truncate text-xs text-fg-muted">{user.roleName}</p>
      </div>
      <div className="mb-2 px-1">
        <ThemeSwitch initial={theme} />
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
      <BrandMark logoUrl={logoUrl} />
      <span className={cn("font-bold", logoUrl ? "text-sm text-fg-muted" : "text-lg")}>משמרות</span>
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
          className="relative rounded-lg p-2 hover:bg-muted"
          aria-label={waiting ? "תפריט (יש בקשות ממתינות)" : "תפריט"}
        >
          <Menu className="h-5 w-5" />
          {waiting ? (
            <span className="absolute end-1.5 top-1.5 flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warning opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-warning" />
            </span>
          ) : null}
        </button>
        <Link href="/" className="flex items-center gap-2">
          {logoUrl ? <BrandMark logoUrl={logoUrl} size="sm" /> : null}
          <span className="font-bold">משמרות</span>
        </Link>
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

/** A waiting-items count that keeps blinking until they are handled; red when some are overdue. */
function CountBadge({ count, urgent }: { count: number; urgent: boolean }) {
  return (
    <span className="relative inline-flex">
      <span
        className={cn(
          "absolute inset-0 animate-ping rounded-full opacity-60 motion-reduce:hidden",
          urgent ? "bg-danger" : "bg-warning",
        )}
      />
      <span
        className={cn(
          "relative min-w-5 rounded-full px-1.5 text-center text-xs leading-5 font-semibold text-white",
          urgent ? "bg-danger" : "bg-warning",
        )}
      >
        {count}
      </span>
    </span>
  );
}
