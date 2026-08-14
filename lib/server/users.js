import { query } from "@/lib/server/db";

/**
 * @param {{ email: string, name?: string, avatar?: string, approved?: boolean }} input
 */
export async function upsertUser(input) {
  const { email, name, avatar, approved = false } = input;
  const result = await query(
    `INSERT INTO users (email, name, avatar, approved)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE SET
       name = COALESCE(EXCLUDED.name, users.name),
       avatar = COALESCE(EXCLUDED.avatar, users.avatar),
       approved = CASE
         WHEN EXCLUDED.approved = true THEN true
         ELSE users.approved
       END,
       updated_at = now()
     RETURNING id, email, name, avatar, approved`,
    [email, name || null, avatar || null, approved],
  );
  return result.rows[0];
}

/**
 * @param {string} email
 * @returns {Promise<string[]>}
 */
export async function getRolesForEmail(email) {
  const roles = ["user"];
  const normalized = email.trim().toLowerCase();

  const adminResult = await query(`SELECT emails FROM role_access WHERE id = 'admins'`);
  const adminEmails = adminResult.rows[0]?.emails || [];
  if (
    Array.isArray(adminEmails) &&
    adminEmails.some((e) => String(e).trim().toLowerCase() === normalized)
  ) {
    roles.push("admin");
  }

  return roles;
}
