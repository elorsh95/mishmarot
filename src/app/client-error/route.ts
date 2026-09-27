import type { NextRequest } from "next/server";
import { z } from "zod";
import { logError } from "@/lib/error-report";
import { RateLimiter, SeenRecently } from "@/lib/rate-limit";
import { getSessionUser } from "@/modules/auth/session";

const schema = z.object({
  message: z.string().max(1000),
  stack: z.string().max(8000).default(""),
  digest: z.string().max(100).optional(),
  source: z.string().max(40).default("browser"),
  url: z.string().max(500).default(""),
});

// This endpoint is public, so it is guarded against being used to flood the log (and the
// "new error" e-mails Error Reporting sends):
/** Per signed-in user (or per IP when signed out). */
const perSender = new RateLimiter(10, 60 * 60 * 1000);
/** All reports together, per server instance. */
const overall = new RateLimiter(60, 60 * 1000);
/** The same error from the same sender is logged once per 10 minutes. */
const repeats = new SeenRecently(10 * 60 * 1000);

/**
 * Browser errors, reported by the error pages and a global listener (instrumentation-client.ts),
 * written to the log like server errors. Public, so errors on the login page are reported too.
 * Anything over the limits is dropped quietly (the answer is the same, so it gives nothing away).
 */
export async function POST(request: NextRequest) {
  const text = await request.text();
  if (text.length > 12_000) return new Response(null, { status: 413 });
  let parsed: z.infer<typeof schema>;
  try {
    parsed = schema.parse(JSON.parse(text));
  } catch {
    return new Response(null, { status: 400 });
  }

  const user = await getSessionUser().catch(() => null);
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const sender = user ? `user:${user.id}` : `ip:${ip}`;
  const done = new Response(null, { status: 204 });
  if (repeats.check(`${sender}|${parsed.message}|${parsed.stack.slice(0, 300)}`)) return done;
  if (!overall.allow("all") || !perSender.allow(sender)) return done;

  const error = new Error(parsed.message);
  error.name = "ClientError";
  if (user) {
    // Keep the browser's stack so Error Reporting groups by where it was thrown.
    error.stack = parsed.stack.includes("\n")
      ? parsed.stack
      : `ClientError: ${parsed.message}\n    at (browser)`;
  } else {
    // Signed-out reports can't be attributed to anyone, so they all share one fixed stack:
    // Error Reporting then sees a single error (one e-mail), whatever the text says.
    error.message = "Browser error on a public page";
    error.stack = `ClientError: Browser error on a public page\n    at publicPage (client-error/route.ts)`;
  }
  logError(error, {
    source: parsed.source,
    path: parsed.url,
    userId: user?.id ?? null,
    digest: parsed.digest,
    service: "mishmarot-web",
    detail: user ? undefined : parsed.message.slice(0, 300),
  });
  return done;
}
