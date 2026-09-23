import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/forgot-password", "/auth/action"];

/**
 * Optimistic check only: redirects to /login when there is no session cookie.
 * The real verification happens on the server in every page and action.
 */
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has("__session");
  const isPublic = PUBLIC_PATHS.includes(request.nextUrl.pathname);
  if (!hasSession && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico|.*\\.(?:png|svg|jpg|ico|webmanifest)$).*)"],
};
