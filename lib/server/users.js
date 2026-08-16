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
