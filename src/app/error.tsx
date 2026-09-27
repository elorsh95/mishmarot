"use client";

import { ErrorScreen } from "@/components/error-screen";

/** Failed public pages (login, password, shared schedules). */
export default function Error(props: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <ErrorScreen {...props} />
    </main>
  );
}
