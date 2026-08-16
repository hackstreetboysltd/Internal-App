import { query } from "@/lib/server/db";
import { publishApiRequestEvent } from "@/lib/server/publishEvent";
import { realNowIso } from "@/lib/server/realTime";

/**
 * @typedef {Object} ApiLogEntry
 * @property {string} requestId
 * @property {string} method
 * @property {string} path
 * @property {Record<string, string>} [query]
 * @property {number} status
 * @property {number} durationMs
 * @property {string | null} [uid]
 * @property {string | null} [email]
 * @property {string | null} [sessionId]
 * @property {string} ip
 * @property {string} [userAgent]
 * @property {boolean} [rateLimited]
 * @property {string | null} [error]
 */

/**
 * Persist + publish an API request log entry (non-blocking persist).
 * @param {ApiLogEntry} entry
 */
export async function logApiRequest(entry) {
  const record = {
    requestId: entry.requestId,
    method: entry.method,
    path: entry.path,
    query: entry.query || {},
    status: entry.status,
    durationMs: entry.durationMs,
    uid: entry.uid || null,
    email: entry.email || null,
    sessionId: entry.sessionId || null,
    ip: entry.ip,
    userAgent: entry.userAgent || "",
    rateLimited: entry.rateLimited === true,
    error: entry.error || null,
    timestamp: realNowIso(),
  };

  await publishApiRequestEvent(record);
  persistApiRequestLog(record).catch((err) => {
    console.error("Failed to persist api_request_log:", err);
  });
}

/**
 * @param {Record<string, unknown>} record
 */
async function persistApiRequestLog(record) {
  await query(
    `INSERT INTO api_request_logs (
      request_id, method, path, query, status, duration_ms,
      uid, email, session_id, ip, user_agent, rate_limited, error, created_at
    ) VALUES (
      $1, $2, $3, $4::jsonb, $5, $6,
      $7::uuid, $8, $9, $10::inet, $11, $12, $13, $14::timestamptz
    )`,
    [
      record.requestId,
      record.method,
      record.path,
      JSON.stringify(record.query),
      record.status,
      record.durationMs,
      record.uid,
      record.email,
      record.sessionId,
      record.ip === "unknown" ? null : record.ip,
      record.userAgent,
      record.rateLimited,
      record.error,
      record.timestamp,
    ],
  );
}
