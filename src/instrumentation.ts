import type { Instrumentation } from "next";

/**
 * Every server error Next.js catches (page renders, server actions, route handlers, the proxy)
 * goes to the log in Error Reporting's format. Errors that a server action handles itself
 * are logged by runAction (lib/action.ts).
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { isExpectedError, logError } = await import("@/lib/error-report");
  if (isExpectedError(err)) return;
  logError(err, {
    source: context.routeType,
    path: request.path,
    method: request.method,
    digest:
      typeof err === "object" && err && "digest" in err
        ? String((err as { digest?: unknown }).digest)
        : undefined,
  });
};
