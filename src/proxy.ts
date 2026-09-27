import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/forgot-password", "/auth/action"];
/** Read-only schedule links shared with agents (see modules/sharing), and the company logo. */
const PUBLIC_PREFIXES = ["/s/", "/branding/"];

/**
 * Optimistic check only: redirects to /login when there is no session cookie.
 * The real verification happens on the server in every page and action.
 */
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has("__session");
  const { pathname } = request.nextUrl;
  const isPublic =
    PUBLIC_PATHS.includes(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
  if (!hasSession && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico|.*\\.(?:png|svg|jpg|ico|webmanifest)$).*)"],
};
