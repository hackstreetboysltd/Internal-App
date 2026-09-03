import { query } from "@/lib/server/db";
import {
  CHANNEL_PORTAL_NOTIFICATIONS,
  STREAM_PORTAL_NOTIFICATIONS,
} from "@/lib/server/constants";
import { publishEvent } from "@/lib/server/publishEvent";

/**
 * @param {{
 *   kind: string,
 *   module: string,
 *   action: string,
 *   itemName: string,
 *   actorName: string,
 *   actorEmail?: string | null,
 *   targetEmail?: string | null,
 *   linkPath?: string | null,
 *   mandatory?: boolean,
 * }} row
 */
export async function insertNotification(row) {
  const result = await query(
    `INSERT INTO notifications
      (kind, module, action, item_name, actor_name, actor_email, target_email, link_path, mandatory)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, kind, module, action, item_name, actor_name, actor_email, target_email, link_path, mandatory, created_at`,
    [
      row.kind,
      row.module,
      row.action,
      row.itemName,
      row.actorName,
      row.actorEmail || null,
      row.targetEmail || null,
      row.linkPath || null,
      row.mandatory === true,
    ],
  );

  const saved = result.rows[0];
  await publishEvent(CHANNEL_PORTAL_NOTIFICATIONS, STREAM_PORTAL_NOTIFICATIONS, {
    type: "notification.created",
    notification: saved,
  });
  return saved;
}

const READER_FILTER = `
  (
    n.kind = 'team'
    OR (n.kind = 'assignee' AND lower(coalesce(n.target_email, '')) = $1)
    OR (n.kind = 'direct' AND lower(coalesce(n.target_email, '')) = $1)
    OR (n.kind = 'admin' AND $2 = true)
  )
`;

/**
 * @param {string[] | undefined} roles
 */
export function readerIsAdmin(roles) {
  return Array.isArray(roles) && roles.includes("admin");
}

/**
 * @param {string} readerEmail
 * @param {boolean} isAdmin
 * @param {number} [limit]
 */
export async function listNotificationsForReader(readerEmail, isAdmin, limit = 50) {
  const normalized = String(readerEmail || "").trim().toLowerCase();
  const result = await query(
    `SELECT
       n.id,
       n.kind,
       n.module,
       n.action,
       n.item_name,
       n.actor_name,
       n.actor_email,
       n.target_email,
       n.link_path,
       n.mandatory,
       n.created_at,
       (nr.reader_email IS NOT NULL) AS read
     FROM notifications n
     LEFT JOIN notification_reads nr
       ON nr.notification_id = n.id AND nr.reader_email = $1
     WHERE ${READER_FILTER}
     ORDER BY n.created_at DESC
     LIMIT $3`,
    [normalized, isAdmin, limit],
  );
  return result.rows;
}

/**
 * @param {string} readerEmail
 * @param {boolean} isAdmin
 */
export async function countUnreadNotifications(readerEmail, isAdmin) {
  const normalized = String(readerEmail || "").trim().toLowerCase();
  const result = await query(
    `SELECT COUNT(*)::int AS count
     FROM notifications n
     LEFT JOIN notification_reads nr
       ON nr.notification_id = n.id AND nr.reader_email = $1
     WHERE nr.reader_email IS NULL
       AND ${READER_FILTER}`,
    [normalized, isAdmin],
  );
  return result.rows[0]?.count || 0;
}

/**
 * @param {string} readerEmail
 * @param {boolean} isAdmin
 * @param {string[]} [notificationIds]
 */
export async function markNotificationsRead(readerEmail, isAdmin, notificationIds) {
  const normalized = String(readerEmail || "").trim().toLowerCase();
  if (Array.isArray(notificationIds) && notificationIds.length > 0) {
    await query(
      `INSERT INTO notification_reads (notification_id, reader_email)
       SELECT n.id, $1
       FROM notifications n
       WHERE n.id = ANY($2::uuid[])
       ON CONFLICT DO NOTHING`,
      [normalized, notificationIds],
    );
    return;
  }

  await query(
    `INSERT INTO notification_reads (notification_id, reader_email)
     SELECT n.id, $1
     FROM notifications n
     LEFT JOIN notification_reads nr
       ON nr.notification_id = n.id AND nr.reader_email = $1
     WHERE nr.reader_email IS NULL
       AND ${READER_FILTER}
     ON CONFLICT DO NOTHING`,
    [normalized, isAdmin],
  );
}

/**
 * @param {string} readerEmail
 * @param {Record<string, unknown>} notification
 * @param {boolean} [isAdmin]
 * @returns {boolean}
 */
export function notificationVisibleToReader(readerEmail, notification, isAdmin = false) {
  const normalized = String(readerEmail || "").trim().toLowerCase();
  const kind = String(notification.kind || "");
  if (kind === "team") return true;
  if (kind === "admin") return isAdmin;
  const target = String(notification.target_email || "").trim().toLowerCase();
  return target === normalized;
}
