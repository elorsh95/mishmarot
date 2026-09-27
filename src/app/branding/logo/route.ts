import type { NextRequest } from "next/server";
import { getLogo } from "@/modules/branding/service";

/**
 * The company logo. Public: the login page and shared schedules show it too. URLs carry the
 * logo's version (?v=), so a matching request can be cached for good.
 */
export async function GET(request: NextRequest) {
  const logo = await getLogo();
  if (!logo) return new Response(null, { status: 404 });
  const versioned = request.nextUrl.searchParams.get("v") === logo.version;
  return new Response(new Uint8Array(logo.bytes), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": versioned ? "public, max-age=31536000, immutable" : "public, max-age=60",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
