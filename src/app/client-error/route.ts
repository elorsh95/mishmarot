import type { NextRequest } from "next/server";
import { z } from "zod";
import { logError } from "@/lib/error-report";
import { getSessionUser } from "@/modules/auth/session";

const schema = z.object({
  message: z.string().max(1000),
  stack: z.string().max(8000).default(""),
  digest: z.string().max(100).optional(),
  source: z.string().max(40).default("browser"),
  url: z.string().max(500).default(""),
});

/**
 * Browser errors, reported by the error pages and a global listener (instrumentation-client.ts),
 * written to the log like server errors. Public, so errors on the login page are reported too.
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
  const error = new Error(parsed.message);
  error.name = "ClientError";
  // Keep the browser's stack so Error Reporting groups by where it was thrown.
  error.stack = parsed.stack.includes("\n")
    ? parsed.stack
    : `Error: ${parsed.message}\n    at (browser)`;
  logError(error, {
    source: parsed.source,
    path: parsed.url,
    userId: user?.id ?? null,
    digest: parsed.digest,
    service: "mishmarot-web",
  });
  return new Response(null, { status: 204 });
}
