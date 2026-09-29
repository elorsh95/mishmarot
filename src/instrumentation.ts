import type { Instrumentation } from "next";

/** The signed-in user's id from the session cookie, so page errors show whose they were. */
async function userIdFrom(cookieHeader: string | string[] | undefined): Promise<string | null> {
  const header = Array.isArray(cookieHeader) ? cookieHeader.join("; ") : (cookieHeader ?? "");
  const value = header
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("__session="))
    ?.slice("__session=".length);
  if (!value) return null;
  try {
    const { adminAuth } = await import("@/lib/firebase/admin");
    return (await adminAuth().verifySessionCookie(decodeURIComponent(value), false)).uid;
  } catch {
    return null;
  }
}

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
    userId: await userIdFrom(request.headers.cookie),
    path: request.path,
    method: request.method,
    digest:
      typeof err === "object" && err && "digest" in err
        ? String((err as { digest?: unknown }).digest)
        : undefined,
  });
};
