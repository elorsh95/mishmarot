import "server-only";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { DomainError } from "@/lib/errors";
import { requireActor, type SessionUser } from "@/modules/auth/session";

/**
 * Uniform result for every server action, so client code can show errors consistently.
 */
export type ActionResult<T = null> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function zodFieldErrors(err: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_";
    out[key] ??= issue.message;
  }
  return out;
}

/**
 * Runs an action as the logged-in user: authentication, error mapping and revalidation.
 * Authorization is enforced inside the services themselves.
 */
export async function runAction<T>(
  fn: (actor: SessionUser) => Promise<T>,
  options: { revalidate?: string[]; message?: string } = {},
): Promise<ActionResult<T>> {
  try {
    const actor = await requireActor();
    const data = await fn(actor);
    for (const path of options.revalidate ?? ["/"]) revalidatePath(path, "layout");
    return { ok: true, data, message: options.message };
  } catch (err) {
    if (err instanceof ZodError) {
      const fieldErrors = zodFieldErrors(err);
      return { ok: false, error: Object.values(fieldErrors)[0] ?? "נתונים לא תקינים", fieldErrors };
    }
    if (err instanceof DomainError) return { ok: false, error: err.message };
    console.error("Unexpected action error", err);
    return { ok: false, error: "אירעה שגיאה לא צפויה. נסו שוב" };
  }
}
