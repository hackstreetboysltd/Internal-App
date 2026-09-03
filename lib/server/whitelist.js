import { query } from "@/lib/server/db";

/** @type {{ byId: Record<string, { emails: unknown, updatedAt: string | null }>, expiresAt: number } | null} */
let roleAccessCache = null;
const ALLOWED_CACHE_MS = 60_000;

export function invalidateAllowedCache() {
  roleAccessCache = null;
}

/**
 * Mirrors client check: empty allowed list means everyone is allowed.
 * Admins are always allowed so saving role_access cannot lock out the console.
 * @param {string} email
 */
export async function isEmailAllowed(email) {
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes("@")) return false;

  const now = Date.now();
  if (
    !roleAccessCache
    || now >= roleAccessCache.expiresAt
  ) {
    const result = await query(
      `SELECT id, emails, updated_at FROM role_access WHERE id IN ('admins', 'allowed')`,
    );
    /** @type {Record<string, { emails: unknown, updatedAt: string | null }>} */
    const byId = {};
    for (const row of result.rows) {
      byId[row.id] = {
        emails: row.emails,
        updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
      };
    }
    roleAccessCache = {
      byId,
      expiresAt: now + ALLOWED_CACHE_MS,
    };
  }

  const adminEmails = roleAccessCache.byId.admins?.emails;
  if (Array.isArray(adminEmails) && adminEmails.some(
    (entry) => String(entry || "").trim().toLowerCase() === normalized,
  )) {
    return true;
  }

  const emails = roleAccessCache.byId.allowed?.emails;
  if (!Array.isArray(emails) || emails.length === 0) {
    return true;
  }

  return emails.some((e) => String(e).trim().toLowerCase() === normalized);
}
