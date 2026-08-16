import { sessionHasAdminRole } from "@/lib/adminAccess";

/**
 * Admin write privileges come from the Redis session, never from a query flag alone.
 * The UI may pass ?admin=1 to mean "I am in admin view"; the server ANDs that with roles.
 */

export { sessionHasAdminRole };

/**
 * @param {Request} request
 */
export function wantsAdminView(request) {
  const url = new URL(request.url);
  return url.searchParams.get("admin") === "1" || url.searchParams.get("adminView") === "1";
}

/**
 * Effective admin view for authorization (owner-guard skip, pending queues).
 * @param {Request} request
 * @param {Record<string, unknown> | null | undefined} session
 */
export function effectiveAdminView(request, session) {
  return wantsAdminView(request) && sessionHasAdminRole(session);
}
