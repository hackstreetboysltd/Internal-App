import { query } from "@/lib/server/db";

/** @type {{ emails: string[] | null, expiresAt: number } | null} */
let allowedCache = null;
const ALLOWED_CACHE_MS = 60_000;

/**
 * Mirrors client check: empty allowed list means everyone is allowed.
 * @param {string} email
 */
export async function isEmailAllowed(email) {
  const now = Date.now();
  if (!allowedCache || now >= allowedCache.expiresAt) {
    const result = await query(`SELECT emails FROM role_access WHERE id = 'allowed'`);
    const emails = result.rows[0]?.emails;
    allowedCache = {
      emails: Array.isArray(emails) ? emails : null,
      expiresAt: now + ALLOWED_CACHE_MS,
    };
  }

  const emails = allowedCache.emails;
  if (!Array.isArray(emails) || emails.length === 0) {
    return true;
  }

  const normalized = email.trim().toLowerCase();
  return emails.some((e) => String(e).trim().toLowerCase() === normalized);
}
