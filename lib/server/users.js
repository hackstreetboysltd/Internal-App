import { query } from "@/lib/server/db";
import { emailIsListedAdmin } from "@/lib/adminAccess";
import { realNowIso } from "@/lib/server/realTime";

/**
 * @param {{ email: string, name?: string, avatar?: string, approved?: boolean }} input
 */
export async function upsertUser(input) {
  const { email, name, avatar, approved = false } = input;
  const now = realNowIso();
  const result = await query(
    `INSERT INTO users (email, name, avatar, approved, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5::timestamptz, $5::timestamptz)
     ON CONFLICT (email) DO UPDATE SET
       name = COALESCE(EXCLUDED.name, users.name),
       avatar = COALESCE(EXCLUDED.avatar, users.avatar),
       approved = CASE
         WHEN EXCLUDED.approved = true THEN true
         ELSE users.approved
       END,
       updated_at = $5::timestamptz
     RETURNING id, email, name, avatar, approved`,
    [email, name || null, avatar || null, approved, now],
  );
  return result.rows[0];
}

/**
 * @param {string} email
 * @returns {Promise<string[]>}
 */
export async function getRolesForEmail(email) {
  const roles = ["user"];
  const adminResult = await query(`SELECT emails FROM role_access WHERE id = 'admins'`);
  if (emailIsListedAdmin(email, adminResult.rows[0]?.emails)) {
    roles.push("admin");
  }

  return roles;
}

const USER_ID_CACHE_MS = 60_000;
/** @type {Map<string, { id: string | null, expiresAt: number }>} */
const userIdByEmailCache = new Map();

/**
 * Look up the canonical users.id for an email (cached).
 * @param {string} email
 * @returns {Promise<string | null>}
 */
export async function getUserIdByEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized.includes("@")) return null;

  const cached = userIdByEmailCache.get(normalized);
  const now = Date.now();
  if (cached && now < cached.expiresAt) {
    return cached.id;
  }

  const result = await query(
    `SELECT id FROM users WHERE lower(email) = $1 LIMIT 1`,
    [normalized],
  );
  const id = result.rows[0]?.id ? String(result.rows[0].id) : null;
  userIdByEmailCache.set(normalized, { id, expiresAt: now + USER_ID_CACHE_MS });
  return id;
}

/**
 * If Redis still holds a deleted/recreated users.id, rebind session.uid to the
 * current row for that email (or return null when the user row is gone).
 * @param {Record<string, unknown> | null} session
 * @param {(sid: string, patch: Record<string, unknown>) => Promise<Record<string, unknown> | null>} patchSessionFn
 * @returns {Promise<Record<string, unknown> | null>}
 */
export async function reconcileSessionUser(session, patchSessionFn) {
  if (!session?.email) return session;
  const email = String(session.email);
  const currentId = await getUserIdByEmail(email);
  if (!currentId) return null;

  const sessionUid = session.uid != null ? String(session.uid) : "";
  if (sessionUid === currentId) return session;

  if (session.sid && typeof patchSessionFn === "function") {
    const patched = await patchSessionFn(String(session.sid), { uid: currentId });
    if (patched) return patched;
  }
  return { ...session, uid: currentId };
}
