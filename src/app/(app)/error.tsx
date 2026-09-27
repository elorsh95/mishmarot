"use client";

import { ErrorScreen } from "@/components/error-screen";

/** A failed page inside the app keeps the menu around it. */
export default function Error(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorScreen {...props} />;
}
