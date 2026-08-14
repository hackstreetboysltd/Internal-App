import { query } from "@/lib/server/db";

/**
 * @param {import('next/server').NextRequest} request
 */
export function readAdminQueryFilters(request) {
  const url = new URL(request.url);
  const sp = url.searchParams;

  return {
    sessionId: sp.get("sessionId") || null,
    email: sp.get("email") || null,
    method: sp.get("method") || null,
    pathPrefix: sp.get("pathPrefix") || sp.get("path") || null,
    status: sp.get("status") ? Number.parseInt(sp.get("status"), 10) : null,
    errorsOnly: sp.get("errorsOnly") === "1" || sp.get("errorsOnly") === "true",
    rateLimitedOnly: sp.get("rateLimitedOnly") === "1" || sp.get("rateLimitedOnly") === "true",
    limit: Math.min(Number.parseInt(sp.get("limit") || "100", 10) || 100, 500),
    offset: Math.max(Number.parseInt(sp.get("offset") || "0", 10) || 0, 0),
  };
}

/**
 * @param {ReturnType<typeof readAdminQueryFilters>} filters
 */
export async function queryApiRequestLogs(filters) {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (filters.sessionId) {
    conditions.push(`session_id = $${idx++}`);
    params.push(filters.sessionId);
  }
  if (filters.email) {
    conditions.push(`email ILIKE $${idx++}`);
    params.push(`%${filters.email}%`);
  }
  if (filters.method) {
    conditions.push(`method = $${idx++}`);
    params.push(filters.method.toUpperCase());
  }
  if (filters.pathPrefix) {
    conditions.push(`path LIKE $${idx++}`);
    params.push(`${filters.pathPrefix}%`);
  }
  if (filters.status && Number.isFinite(filters.status)) {
    conditions.push(`status = $${idx++}`);
    params.push(filters.status);
  }
  if (filters.errorsOnly) {
    conditions.push("status >= 400");
  }
  if (filters.rateLimitedOnly) {
    conditions.push("rate_limited = true");
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(filters.limit, filters.offset);

  const result = await query(
    `SELECT id, request_id, method, path, query, status, duration_ms,
            uid, email, session_id, ip, user_agent, rate_limited, error, created_at
     FROM api_request_logs
     ${where}
     ORDER BY created_at DESC
     LIMIT $${idx++} OFFSET $${idx++}`,
    params,
  );

  return result.rows.map(mapApiRow);
}

/**
 * @param {ReturnType<typeof readAdminQueryFilters>} filters
 */
export async function queryActivityLogs(filters) {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (filters.sessionId) {
    conditions.push(`session_id = $${idx++}`);
    params.push(filters.sessionId);
  }
  if (filters.email) {
    conditions.push(`email ILIKE $${idx++}`);
    params.push(`%${filters.email}%`);
  }
  if (filters.pathPrefix) {
    conditions.push(`path LIKE $${idx++}`);
    params.push(`${filters.pathPrefix}%`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(filters.limit, filters.offset);

  const result = await query(
    `SELECT id, uid, email, session_id, event_type, path, meta, ip, created_at
     FROM activity_logs
     ${where}
     ORDER BY created_at DESC
     LIMIT $${idx++} OFFSET $${idx++}`,
    params,
  );

  return result.rows.map(mapActivityRow);
}

export async function queryAdminStats() {
  const [window5m, window1m, topPaths, hourly] = await Promise.all([
    query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status >= 400)::int AS errors,
              COUNT(*) FILTER (WHERE rate_limited)::int AS rate_limited
       FROM api_request_logs
       WHERE created_at > now() - interval '5 minutes'`,
    ),
    query(
      `SELECT COUNT(*)::int AS total
       FROM api_request_logs
       WHERE created_at > now() - interval '1 minute'`,
    ),
    query(
      `SELECT path, COUNT(*)::int AS count
       FROM api_request_logs
       WHERE created_at > now() - interval '1 hour'
       GROUP BY path
       ORDER BY count DESC
       LIMIT 8`,
    ),
    query(
      `SELECT hour, request_count, error_count, rate_limited_count, activity_count
       FROM log_hourly_stats
       WHERE hour > now() - interval '24 hours'
       ORDER BY hour DESC
       LIMIT 24`,
    ),
  ]);

  const totals = window5m.rows[0] || { total: 0, errors: 0, rate_limited: 0 };
  const lastMinute = window1m.rows[0]?.total || 0;

  return {
    rps: Math.round((lastMinute / 60) * 100) / 100,
    windowMinutes: 5,
    totalRequests: totals.total,
    errorCount: totals.errors,
    errorRate: totals.total > 0 ? Math.round((totals.errors / totals.total) * 1000) / 10 : 0,
    rateLimitedCount: totals.rate_limited,
    topPaths: topPaths.rows.map((row) => ({ path: row.path, count: row.count })),
    hourly: hourly.rows.map((row) => ({
      hour: row.hour instanceof Date ? row.hour.toISOString() : row.hour,
      requestCount: row.request_count,
      errorCount: row.error_count,
      rateLimitedCount: row.rate_limited_count,
      activityCount: row.activity_count,
    })),
  };
}

/**
 * @param {Record<string, unknown>} row
 */
function mapApiRow(row) {
  return {
    id: String(row.id),
    requestId: row.request_id,
    method: row.method,
    path: row.path,
    query: row.query || {},
    status: row.status,
    durationMs: row.duration_ms,
    uid: row.uid,
    email: row.email,
    sessionId: row.session_id,
    ip: row.ip,
    userAgent: row.user_agent,
    rateLimited: row.rate_limited,
    error: row.error,
    timestamp: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

/**
 * @param {Record<string, unknown>} row
 */
function mapActivityRow(row) {
  return {
    id: String(row.id),
    uid: row.uid,
    email: row.email,
    sessionId: row.session_id,
    eventType: row.event_type,
    path: row.path,
    meta: row.meta || {},
    ip: row.ip,
    timestamp: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}
