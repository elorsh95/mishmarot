import type { ReactNode } from "react";
import { BrandMark } from "@/components/brand";
import { getBranding } from "@/modules/branding/service";
import { logoUrl } from "@/modules/branding/types";

/** Centered card used by the public pages (login, set password, forgot password). */
export async function AuthCard({ subtitle, children }: { subtitle: string; children: ReactNode }) {
  const logo = logoUrl(await getBranding());
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <BrandMark logoUrl={logo} size="lg" />
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
