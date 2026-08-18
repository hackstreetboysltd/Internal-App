import { NextResponse } from "next/server";
import { getSessionCookieName } from "@/lib/server/constants";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "/Internal-App";

const PUBLIC_PREFIXES = [
  "/login",
  "/github-connect",
  "/api/auth/google",
  "/api/auth/callback",
  "/api/health",
];

function withBasePath(path) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${BASE_PATH}${normalized === "/" ? "/" : normalized}`;
}

/** Strip basePath so checks work whether Next includes it in pathname or not. */
function appPathname(pathname) {
  if (pathname === BASE_PATH || pathname === `${BASE_PATH}/`) return "/";
  if (pathname.startsWith(`${BASE_PATH}/`)) {
    return pathname.slice(BASE_PATH.length) || "/";
  }
  return pathname || "/";
}

function isPublicPath(pathname) {
  if (pathname.startsWith("/_next")) return true;
  if (pathname === "/favicon.ico") return true;
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function middleware(request) {
  const rawPath = request.nextUrl.pathname;
  const pathname = appPathname(rawPath);
  const cookieName = getSessionCookieName();
  const sid = request.cookies.get(cookieName)?.value;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Cookie presence only (Edge cannot talk to Redis via ioredis).
  // APIs validate the Redis session in withApi; HTML routes re-check via /api/auth/me.
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  if (!sid) {
    const loginUrl = new URL(withBasePath("/login/"), request.url);
    loginUrl.searchParams.set("returnTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Explicitly include `/` — some Next matchers skip the bare root path.
  matcher: ["/", "/((?!_next/static|_next/image|favicon.ico).*)"],
};
