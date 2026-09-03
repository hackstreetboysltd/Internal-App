/**
 * Regression: api_request_logs / activity_logs must accept orphan session uids
 * (Redis session uid not present in users) without FK 23503.
 *
 * Usage: node scripts/test-orphan-uid-logging.mjs
 */
import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import pg from "pg";

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    try {
      const raw = readFileSync(file, "utf8");
      for (const line of raw.split("\n")) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (m && !process.env[m[1]]) {
          process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
        }
      }
    } catch {
      /* optional */
    }
  }
}

loadEnv();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });

async function insertApiLog(orphanUid) {
  const requestId = randomUUID();
  await pool.query(
    `INSERT INTO api_request_logs (
      request_id, method, path, query, status, duration_ms,
      uid, email, session_id, ip, user_agent, rate_limited, error, created_at
    ) VALUES (
      $1, $2, $3, $4::jsonb, $5, $6,
      (SELECT id FROM users WHERE id = $7::uuid), $8, $9, $10::inet, $11, $12, $13, now()
    )`,
    [
      requestId,
      "GET",
      "/api/notifications/",
      "{}",
      200,
      12,
      orphanUid,
      "orphan@example.com",
      "test-session",
      null,
      "test",
      false,
      null,
    ],
  );
  const row = await pool.query(
    `SELECT uid, email FROM api_request_logs WHERE request_id = $1`,
    [requestId],
  );
  return row.rows[0];
}

async function insertActivity(orphanUid) {
  const result = await pool.query(
    `INSERT INTO activity_logs (uid, email, session_id, event_type, path, meta, ip, created_at)
     VALUES (
       (SELECT id FROM users WHERE id = $1::uuid),
       $2, $3, $4, $5, $6::jsonb, $7::inet, now()
     )
     RETURNING id, uid`,
    [orphanUid, "orphan@example.com", "test-session", "test.orphan_uid", "/", "{}", null],
  );
  return result.rows[0];
}

async function main() {
  const orphanUid = randomUUID();
  const exists = await pool.query(`SELECT 1 FROM users WHERE id = $1`, [orphanUid]);
  if (exists.rowCount) {
    throw new Error("orphan uid unexpectedly exists in users");
  }

  const apiRow = await insertApiLog(orphanUid);
  if (apiRow.uid !== null) {
    throw new Error(`expected api_request_logs.uid NULL, got ${apiRow.uid}`);
  }
  console.log("api_request_logs: orphan uid → NULL ok");

  const activityRow = await insertActivity(orphanUid);
  if (activityRow.uid !== null) {
    throw new Error(`expected activity_logs.uid NULL, got ${activityRow.uid}`);
  }
  console.log("activity_logs: orphan uid → NULL ok");

  await pool.end();
  console.log("PASS");
}

main().catch(async (err) => {
  console.error("FAIL:", err);
  await pool.end().catch(() => {});
  process.exit(1);
});
