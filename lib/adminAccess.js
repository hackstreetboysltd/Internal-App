/**
 * Shared admin checks. Safe for client and server.
 */

/**
 * @param {unknown} emails
 * @returns {string[]}
 */
export function normalizeEmailList(emails) {
  if (!emails) return [];
  let list = emails;
  if (typeof emails === "string") {
    try {
      list = JSON.parse(emails);
    } catch {
      list = emails.split(/[,;\s]+/);
    }
  }
  if (!Array.isArray(list)) return [];
  return list.map((email) => String(email).trim().toLowerCase()).filter(Boolean);
}

/**
 * @param {unknown} email
 * @param {unknown} emails
 */
export function emailIsListedAdmin(email, emails) {
  const normalized = String(email || "").trim().toLowerCase();
  return !!normalized && normalizeEmailList(emails).includes(normalized);
}

/**
 * @param {Record<string, unknown> | null | undefined} session
 */
export function sessionHasAdminRole(session) {
  const roles = session?.roles;
  if (!Array.isArray(roles)) return false;
  return roles.some((role) => String(role).toLowerCase() === "admin");
}
