/**
 * Cron entry for log retention + hourly rollup.
 * Usage: node scripts/retention.mjs
 *
 * Requires DATABASE_URL. Safe to run hourly.
 */
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://portal:portal@localhost:5432/portal";

function envInt(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function main() {
  const apiDays = envInt("API_LOG_RETENTION_DAYS", 30);
  const activityDays = envInt("ACTIVITY_LOG_RETENTION_DAYS", 90);
  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  try {
    await pool.query(
      `INSERT INTO log_hourly_stats (hour, request_count, error_count, rate_limited_count, activity_count)
       SELECT COALESCE(req.hour, act.hour) AS hour,
              COALESCE(req.request_count, 0),
              COALESCE(req.error_count, 0),
              COALESCE(req.rate_limited_count, 0),
              COALESCE(act.activity_count, 0)
       FROM (
         SELECT date_trunc('hour', created_at) AS hour,
                COUNT(*)::int AS request_count,
                COUNT(*) FILTER (WHERE status >= 400)::int AS error_count,
                COUNT(*) FILTER (WHERE rate_limited)::int AS rate_limited_count
         FROM api_request_logs
         WHERE created_at >= now() - interval '25 hours'
         GROUP BY 1
       ) req
       FULL OUTER JOIN (
         SELECT date_trunc('hour', created_at) AS hour,
                COUNT(*)::int AS activity_count
         FROM activity_logs
         WHERE created_at >= now() - interval '25 hours'
         GROUP BY 1
       ) act ON req.hour = act.hour
       ON CONFLICT (hour) DO UPDATE SET
         request_count = EXCLUDED.request_count,
         error_count = EXCLUDED.error_count,
         rate_limited_count = EXCLUDED.rate_limited_count,
         activity_count = EXCLUDED.activity_count`,
    );

    const api = await pool.query(
      `DELETE FROM api_request_logs WHERE created_at < now() - ($1 * interval '1 day')`,
      [apiDays],
    );
    const activity = await pool.query(
      `DELETE FROM activity_logs WHERE created_at < now() - ($1 * interval '1 day')`,
      [activityDays],
    );
    const stats = await pool.query(
      `DELETE FROM log_hourly_stats WHERE hour < now() - ($1 * interval '1 day')`,
      [Math.max(apiDays, activityDays)],
    );

    console.log("Retention complete:", {
      apiDays,
      activityDays,
      apiDeleted: api.rowCount,
      activityDeleted: activity.rowCount,
      hourlyStatsDeleted: stats.rowCount,
    });
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Retention job failed:", err.message);
  process.exitCode = 1;
});
