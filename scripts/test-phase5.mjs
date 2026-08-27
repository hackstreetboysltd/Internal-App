/**
 * Phase 5 smoke test — activity ingest + admin SSE.
 * Usage: node scripts/test-phase5.mjs [baseUrl]
 */
import { randomUUID } from "crypto";
import Redis from "ioredis";
import pg from "pg";

const BASE = process.argv[2] || "http://localhost:3001/Internal-App";
const DATABASE_URL = process.env.DATABASE_URL || "postgresql://portal:portal@localhost:5432/portal";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

const pool = new pg.Pool({ connectionString: DATABASE_URL });
const redis = new Redis(REDIS_URL);

async function createSession(roles = ["user"]) {
  const email = "phase5-test@example.com";
  const uid = randomUUID();
  const sid = randomUUID();

  await pool.query(
    `INSERT INTO users (id, email, name, approved)
     VALUES ($1, $2, $3, true)
     ON CONFLICT (email) DO UPDATE SET approved = true`,
    [uid, email, "Phase 5 Tester"],
  );
  const userRes = await pool.query(`SELECT id FROM users WHERE email = $1`, [email]);
  const userId = userRes.rows[0].id;

  await pool.query(
    `UPDATE role_access SET emails = '["phase5-test@example.com"]'::jsonb, updated_at = now() WHERE id = 'allowed'`,
  );

  const session = {
    sid,
    uid: userId,
    email,
    name: "Phase 5 Tester",
    avatar: "",
    roles,
    sessionId: "p5-tab",
    createdAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    needsProfileSync: false,
  };

  await redis.setex(`session:${sid}`, 604800, JSON.stringify(session));
  return { sid, userId, email };
}

async function createAdminSession() {
  const email = "phase5-admin@example.com";
  const uid = randomUUID();
  const sid = randomUUID();

  await pool.query(
    `INSERT INTO users (id, email, name, approved)
     VALUES ($1, $2, $3, true)
     ON CONFLICT (email) DO UPDATE SET approved = true`,
    [uid, email, "Phase 5 Admin"],
  );
  const userRes = await pool.query(`SELECT id FROM users WHERE email = $1`, [email]);
  const userId = userRes.rows[0].id;

  await pool.query(
    `UPDATE role_access SET emails = $1::jsonb, updated_at = now() WHERE id = 'admins'`,
    [JSON.stringify([email])],
  );

  const session = {
    sid,
    uid: userId,
    email,
    name: "Phase 5 Admin",
    avatar: "",
    roles: ["user", "admin"],
    sessionId: "p5-admin",
    createdAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    needsProfileSync: false,
  };

  await redis.setex(`session:${sid}`, 604800, JSON.stringify(session));
  return sid;
}

async function main() {
  console.log("Phase 5 tests against", BASE);
  const { sid, email } = await createSession();
  const headers = { Cookie: `sid=${sid}`, "Content-Type": "application/json" };

  const before = await pool.query(`SELECT COUNT(*)::int AS n FROM activity_logs`);
  const events = [
    { eventType: "module.visit", path: "/apps/", meta: { module: "apps" } },
    { eventType: "auth.login", path: "/", meta: { source: "test" } },
  ];

  const postRes = await fetch(`${BASE}/api/activity/`, {
    method: "POST",
    headers,
    body: JSON.stringify({ events, tabSessionId: "p5-tab" }),
  });
  if (!postRes.ok) {
    throw new Error(`POST activity failed: ${postRes.status} ${await postRes.text()}`);
  }
  const postBody = await postRes.json();
  if (!postBody.success || postBody.count !== 2) {
    throw new Error("Unexpected POST activity response");
  }
  console.log("POST /api/activity → 200");

  await new Promise((r) => setTimeout(r, 300));
  const after = await pool.query(`SELECT COUNT(*)::int AS n FROM activity_logs`);
  if (after.rows[0].n < before.rows[0].n + 2) {
    throw new Error("activity_logs rows were not inserted");
  }
  console.log("activity_logs persisted:", after.rows[0].n);

  const row = await pool.query(
    `SELECT event_type, email, session_id FROM activity_logs
     WHERE email = $1 ORDER BY id DESC LIMIT 1`,
    [email],
  );
  if (row.rows[0]?.event_type !== "auth.login") {
    throw new Error("Latest activity row mismatch");
  }
  if (row.rows[0]?.session_id !== "p5-tab") {
    throw new Error("session_id not stored on activity log");
  }
  console.log("activity row fields OK");

  const streamLen = await redis.xlen("stream:api:activity");
  if (streamLen < 1) {
    throw new Error("Redis stream:api:activity is empty");
  }
  console.log("Redis activity stream length:", streamLen);

  const noAuth = await fetch(`${BASE}/api/activity/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ events: [{ eventType: "module.visit", path: "/" }] }),
  });
  if (noAuth.status !== 401) {
    throw new Error(`Expected 401 without session, got ${noAuth.status}`);
  }
  console.log("unauthenticated POST → 401");

  const adminSid = await createAdminSession();
  const adminRes = await fetch(`${BASE}/api/admin/stream/activity/`, {
    headers: { Cookie: `sid=${adminSid}` },
  });
  if (adminRes.status !== 200) {
    throw new Error(`Expected 200 for admin activity SSE, got ${adminRes.status}`);
  }
  const reader = adminRes.body.getReader();
  const { value } = await reader.read();
  reader.cancel().catch(() => {});
  const chunk = new TextDecoder().decode(value);
  if (!chunk.includes("module.visit") && !chunk.includes("auth.login")) {
    throw new Error("Activity SSE did not replay events");
  }
  console.log("admin activity SSE → 200 with replay");

  console.log("\nPhase 5 tests passed.");
}

main()
  .catch((err) => {
    console.error("Phase 5 tests failed:", err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
    await redis.quit();
  });
