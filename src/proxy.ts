import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic check only: redirects to /login when there is no session cookie.
 * The real verification happens on the server in every page and action.
 */
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has("__session");
  const isLogin = request.nextUrl.pathname === "/login";
  if (!hasSession && !isLogin) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico|.*\\.(?:png|svg|jpg|ico|webmanifest)$).*)"],
};
