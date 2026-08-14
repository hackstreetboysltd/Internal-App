/**
 * Phase 2 smoke test — run with Docker (Postgres + Redis) and Next server up.
 * Usage: node scripts/test-phase2.js [baseUrl]
 */
import { randomUUID } from "crypto";
import Redis from "ioredis";
import pg from "pg";

const BASE = process.argv[2] || "http://localhost:3001/Internal-App";
const DATABASE_URL = process.env.DATABASE_URL || "postgresql://portal:portal@localhost:5432/portal";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

const pool = new pg.Pool({ connectionString: DATABASE_URL });
const redis = new Redis(REDIS_URL);

async function fetchJson(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, options);
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { res, body };
}

async function createAdminSession() {
  const email = "admin-test@example.com";
  const uid = randomUUID();
  const sid = randomUUID();

  await pool.query(
    `INSERT INTO users (id, email, name, approved)
     VALUES ($1, $2, $3, true)
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [uid, email, "Phase 2 Tester"],
  );

  const userRes = await pool.query(`SELECT id FROM users WHERE email = $1`, [email]);
  const userId = userRes.rows[0].id;

  await pool.query(
    `UPDATE role_access
     SET emails = $1::jsonb, updated_at = now()
     WHERE id = 'admins'`,
    [JSON.stringify([email])],
  );

  const session = {
    sid,
    uid: userId,
    email,
    name: "Phase 2 Tester",
    avatar: "",
    roles: ["user", "admin"],
    sessionId: "test-tab",
    createdAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    needsProfileSync: false,
  };

  await redis.setex(`session:${sid}`, 604800, JSON.stringify(session));
  return sid;
}

async function main() {
  console.log("Phase 2 tests against", BASE);

  const before = await pool.query(`SELECT COUNT(*)::int AS n FROM api_request_logs`);
  const health = await fetchJson("/api/health/");
  console.log("health:", health.res.status, health.body?.phase);

  if (health.res.status !== 200) {
    throw new Error("Health check failed");
  }

  await new Promise((r) => setTimeout(r, 300));
  const after = await pool.query(`SELECT COUNT(*)::int AS n FROM api_request_logs`);
  if (after.rows[0].n <= before.rows[0].n) {
    throw new Error("api_request_logs row was not inserted");
  }
  console.log("api_request_logs persisted:", after.rows[0].n);

  const streamLen = await redis.xlen("stream:api:requests");
  if (streamLen < 1) {
    throw new Error("Redis stream:api:requests is empty");
  }
  console.log("Redis stream length:", streamLen);

  const unauth = await fetchJson("/api/auth/me");
  if (unauth.res.status !== 401) {
    throw new Error(`Expected 401 for /api/auth/me without cookie, got ${unauth.res.status}`);
  }
  console.log("unauthenticated /api/auth/me → 401");

  const userSid = randomUUID();
  await redis.setex(
    `session:${userSid}`,
    604800,
    JSON.stringify({
      sid: userSid,
      uid: randomUUID(),
      email: "user@example.com",
      name: "User",
      avatar: "",
      roles: ["user"],
      sessionId: "u1",
      createdAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    }),
  );

  const forbidden = await fetch(`${BASE}/api/admin/stream/requests/`, {
    headers: { Cookie: `sid=${userSid}` },
  });
  if (forbidden.status !== 403) {
    throw new Error(`Expected 403 for non-admin SSE, got ${forbidden.status}`);
  }
  console.log("non-admin SSE → 403");

  const adminSid = await createAdminSession();
  const adminRes = await fetch(`${BASE}/api/admin/stream/requests/`, {
    headers: { Cookie: `sid=${adminSid}` },
  });
  if (adminRes.status !== 200) {
    throw new Error(`Expected 200 for admin SSE, got ${adminRes.status}`);
  }
  const reader = adminRes.body.getReader();
  const { value } = await reader.read();
  reader.cancel().catch(() => {});
  const chunk = new TextDecoder().decode(value);
  if (!chunk.includes("data:")) {
    throw new Error("SSE stream did not emit data events");
  }
  console.log("admin SSE → 200 with data replay");

  console.log("\nPhase 2 tests passed.");
}

main()
  .catch((err) => {
    console.error("Phase 2 tests failed:", err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
    await redis.quit();
  });
