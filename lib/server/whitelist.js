import { query } from "@/lib/server/db";

/**
 * Mirrors client check: empty allowed list means everyone is allowed.
 * @param {string} email
 */
export async function isEmailAllowed(email) {
  const result = await query(`SELECT emails FROM role_access WHERE id = 'allowed'`);
  const emails = result.rows[0]?.emails;

  if (!Array.isArray(emails) || emails.length === 0) {
    return true;
  }

  const normalized = email.trim().toLowerCase();
  return emails.some((e) => String(e).trim().toLowerCase() === normalized);
}
