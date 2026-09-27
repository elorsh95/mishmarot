import "server-only";

/**
 * Unexpected errors, written as one JSON line per error in the format Google Cloud Error Reporting
 * picks up from the App Hosting (Cloud Run) logs. Error Reporting groups them and can e-mail new
 * ones (see README, "התראות על תקלות"). Locally the error is printed as is.
 */

export interface ErrorContext {
  /** Where it happened: a page render, a server action, a download, the browser… */
  source: string;
  path?: string;
  method?: string;
  /** The signed-in user's id (never names, e-mails or form data). */
  userId?: string | null;
  /** Next.js error digest, shown to the user on the error page. */
  digest?: string;
  /** "mishmarot" for the server, "mishmarot-web" for errors reported by browsers. */
  service?: string;
  /** Extra text kept in the log entry but outside the grouping (e.g. a signed-out report's text). */
  detail?: string;
}

const REPORTED_ERROR_EVENT =
  "type.googleapis.com/google.devtools.clouderrorreporting.v1beta1.ReportedErrorEvent";

/** Error Reporting needs a stack trace in `message`; build one if the value isn't an Error. */
function stackOf(error: unknown): string {
  if (error instanceof Error) return error.stack || `${error.name}: ${error.message}`;
  return `Error: ${typeof error === "string" ? error : JSON.stringify(error)}\n    at (unknown)`;
}

export function logError(error: unknown, context: ErrorContext) {
  if (process.env.NODE_ENV !== "production") {
    console.error(`[${context.source}]`, context.path ?? "", error);
    return;
  }
  const entry = {
    severity: "ERROR",
    "@type": REPORTED_ERROR_EVENT,
    message: stackOf(error),
    serviceContext: {
      service: context.service ?? "mishmarot",
      // Cloud Run sets the revision; it tells which deploy an error started in.
      version: process.env.K_REVISION ?? "unknown",
    },
    context: {
      httpRequest: context.path
        ? { method: context.method ?? "GET", url: context.path }
        : undefined,
      user: context.userId ?? undefined,
    },
    source: context.source,
    digest: context.digest,
    detail: context.detail,
  };
  // stderr: Cloud Run parses JSON lines into structured log entries.
  process.stderr.write(`${JSON.stringify(entry)}\n`);
}

/** Errors that are part of normal flow and must not be reported. */
export function isExpectedError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const digest = "digest" in error ? String((error as { digest?: unknown }).digest) : "";
  // notFound(), redirect(), forbidden() and friends throw errors with these digests.
  if (/^(NEXT_(NOT_FOUND|REDIRECT|HTTP_ERROR_FALLBACK)|DYNAMIC_SERVER_USAGE)/.test(digest))
    return true;
  const name = (error as { name?: unknown }).name;
  // DomainError and its subclasses carry messages meant for the user.
  return (
    typeof name === "string" && /^(Domain|Forbidden|NotFound|Unauthenticated)Error$/.test(name)
  );
}
