import { ForbiddenError } from "@/lib/errors";
import { agentImportTemplate } from "@/modules/agents/import";
import { getSessionUser } from "@/modules/auth/session";

/** Excel template for importing agents. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return new Response(null, { status: 401 });
  try {
    const body = await agentImportTemplate(user);
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="agents-template.xlsx"; filename*=UTF-8''${encodeURIComponent("תבנית ייבוא נציגים.xlsx")}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof ForbiddenError) return new Response(null, { status: 403 });
    throw err;
  }
}
