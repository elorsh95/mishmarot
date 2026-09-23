import type { ReactNode } from "react";
import { CalendarDays } from "lucide-react";

/** Centered card used by the public pages (login, set password, forgot password). */
export function AuthCard({ subtitle, children }: { subtitle: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-white shadow-md">
            <CalendarDays className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold">משמרות</h1>
            <p className="text-sm text-fg-muted">{subtitle}</p>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">{children}</div>
      </div>
    </main>
  );
}
