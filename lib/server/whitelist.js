import { query } from "@/lib/server/db";

/** @type {{ emails: string[] | null, expiresAt: number, updatedAt: string | null } | null} */
let allowedCache = null;
const ALLOWED_CACHE_MS = 60_000;

export function invalidateAllowedCache() {
  allowedCache = null;
}

/**
 * Mirrors client check: empty allowed list means everyone is allowed.
 * @param {string} email
 */
export async function isEmailAllowed(email) {
  const now = Date.now();
  const result = await query(`SELECT emails, updated_at FROM role_access WHERE id = 'allowed'`);
  const row = result.rows[0];
  const updatedAt = row?.updated_at ? new Date(row.updated_at).toISOString() : null;
  if (
    !allowedCache
    || now >= allowedCache.expiresAt
    || allowedCache.updatedAt !== updatedAt
  ) {
    const emails = row?.emails;
    allowedCache = {
      emails: Array.isArray(emails) ? emails : null,
      expiresAt: now + ALLOWED_CACHE_MS,
      updatedAt,
    };
  }

  const emails = allowedCache.emails;
  if (!Array.isArray(emails) || emails.length === 0) {
    return true;
  }

  const normalized = email.trim().toLowerCase();
  return emails.some((e) => String(e).trim().toLowerCase() === normalized);
}
