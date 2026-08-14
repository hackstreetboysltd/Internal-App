import { getLogRetentionDays } from "@/lib/server/constants";
import { query } from "@/lib/server/db";

/**
 * Upsert hourly request + activity aggregates, then delete logs older than retention.
 */
export async function runHardeningJobs() {
  const { apiDays, activityDays } = getLogRetentionDays();

  await query(
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

  const apiDeleted = await query(
    `DELETE FROM api_request_logs
     WHERE created_at < now() - ($1 * interval '1 day')`,
    [apiDays],
  );
  const activityDeleted = await query(
    `DELETE FROM activity_logs
     WHERE created_at < now() - ($1 * interval '1 day')`,
    [activityDays],
  );
  const statsDeleted = await query(
    `DELETE FROM log_hourly_stats
     WHERE hour < now() - ($1 * interval '1 day')`,
    [Math.max(apiDays, activityDays)],
  );

  return {
    apiDays,
    activityDays,
    apiDeleted: apiDeleted.rowCount || 0,
    activityDeleted: activityDeleted.rowCount || 0,
    hourlyStatsDeleted: statsDeleted.rowCount || 0,
  };
}
