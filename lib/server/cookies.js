import { getSessionCookieName, getSessionTtlSec } from "@/lib/server/constants";
import { getCookiePath } from "@/lib/server/appUrl";

function cookieOptions(maxAge) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge,
    path: getCookiePath(),
  };
}

/**
 * @param {import('next/server').NextResponse} response
 * @param {string} sid
 */
export function setSessionCookie(response, sid) {
  response.cookies.set(getSessionCookieName(), sid, cookieOptions(getSessionTtlSec()));
}

/**
 * @param {import('next/server').NextResponse} response
 */
export function clearSessionCookie(response) {
  response.cookies.set(getSessionCookieName(), "", cookieOptions(0));
}

/**
 * @param {import('next/server').NextRequest} request
 */
export function readSessionCookie(request) {
  return request.cookies.get(getSessionCookieName())?.value || null;
}
