"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendClientError } from "@/lib/client-error";

/**
 * Shown when a page fails. The error is reported (server errors are already in the log and
 * carry a digest, which is shown so a report can be matched to it).
 */
export function ErrorScreen({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // Errors from the server arrive with a digest and were logged there already.
    if (!error.digest) sendClientError(error, { source: "error-boundary" });
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-16 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-danger/10 text-danger">
        <AlertTriangle className="h-6 w-6" />
      </span>
      <h1 className="text-xl font-bold">משהו השתבש</h1>
      <p className="text-sm text-fg-muted">
        התקלה נרשמה ותטופל. אפשר לנסות שוב, ואם זה חוזר, לרענן את הדף.
      </p>
      <div className="mt-2 flex gap-2">
        <Button onClick={() => retry()}>
          <RotateCcw className="h-4 w-4" />
          נסו שוב
        </Button>
        <Button variant="secondary" onClick={() => window.location.reload()}>
          רענון הדף
        </Button>
      </div>
      {error.digest ? (
        <p className="mt-4 text-xs text-fg-subtle" dir="ltr">
          קוד תקלה: {error.digest}
        </p>
      ) : null}
    </div>
  );
}
