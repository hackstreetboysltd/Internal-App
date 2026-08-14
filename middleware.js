import { NextResponse } from "next/server";
import { getSessionCookieName } from "@/lib/server/constants";

const PUBLIC_PREFIXES = [
  "/login",
  "/github-connect",
  "/kernel-test",
  "/api/auth/google",
  "/api/auth/callback",
  "/api/health",
];

function isPublicPath(pathname) {
  if (pathname.startsWith("/_next")) return true;
  if (pathname === "/favicon.ico") return true;
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function middleware(request) {
  const { pathname } = request.nextUrl;
  const cookieName = getSessionCookieName();
  const sid = request.cookies.get(cookieName)?.value;

  if (isPublicPath(pathname)) {
    if (sid && (pathname === "/login" || pathname === "/login/")) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  // API routes handle auth, rate limits, and logging in route handlers (withApi).
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  if (!sid) {
    const loginUrl = new URL("/login/", request.url);
    loginUrl.searchParams.set("returnTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
