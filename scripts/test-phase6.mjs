/**
 * Phase 6 smoke test — admin observability APIs.
 * Usage: node scripts/test-phase6.mjs [baseUrl]
 */
import { randomUUID } from "crypto";
import Redis from "ioredis";
import pg from "pg";

const BASE = process.argv[2] || "http://localhost:3001/Internal-App";
const DATABASE_URL = process.env.DATABASE_URL || "postgresql://portal:portal@localhost:5432/portal";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

const pool = new pg.Pool({ connectionString: DATABASE_URL });
const redis = new Redis(REDIS_URL);

async function createSession(email, roles) {
  const uid = randomUUID();
  const sid = randomUUID();

  await pool.query(
    `INSERT INTO users (id, email, name, approved)
     VALUES ($1, $2, $3, true)
     ON CONFLICT (email) DO UPDATE SET approved = true`,
    [uid, email, "Phase 6 Tester"],
  );
  const userRes = await pool.query(`SELECT id FROM users WHERE email = $1`, [email]);
  const userId = userRes.rows[0].id;

  const session = {
    sid,
    uid: userId,
    email,
    name: "Phase 6 Tester",
    avatar: "",
    roles,
    sessionId: "p6",
    createdAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    needsProfileSync: false,
  };

  await redis.setex(`session:${sid}`, 604800, JSON.stringify(session));
  return sid;
}

async function main() {
  console.log("Phase 6 tests against", BASE);

  const userSid = await createSession("phase6-user@example.com", ["user"]);
  const adminEmail = "phase6-admin@example.com";
  const adminSid = await createSession(adminEmail, ["user", "admin"]);

  await pool.query(
    `UPDATE role_access SET emails = $1::jsonb WHERE id = 'admins'`,
    [JSON.stringify([adminEmail])],
  );

  const forbidden = await fetch(`${BASE}/api/admin/stats/`, {
    headers: { Cookie: `sid=${userSid}` },
  });
  if (forbidden.status !== 403) {
    throw new Error(`Expected 403 for non-admin stats, got ${forbidden.status}`);
  }
  console.log("non-admin stats → 403");

  const statsRes = await fetch(`${BASE}/api/admin/stats/`, {
    headers: { Cookie: `sid=${adminSid}` },
  });
  if (!statsRes.ok) {
    throw new Error(`Admin stats failed: ${statsRes.status}`);
  }
  const stats = await statsRes.json();
  if (typeof stats.rps !== "number" || !Array.isArray(stats.topPaths)) {
    throw new Error("Unexpected stats shape");
  }
  console.log("GET /api/admin/stats → 200, rps:", stats.rps);

  const reqRes = await fetch(`${BASE}/api/admin/requests/?limit=5`, {
    headers: { Cookie: `sid=${adminSid}` },
  });
  if (!reqRes.ok) {
    throw new Error(`Admin requests query failed: ${reqRes.status}`);
  }
  const reqBody = await reqRes.json();
  if (!Array.isArray(reqBody.rows)) {
    throw new Error("Unexpected requests response");
  }
  console.log("GET /api/admin/requests → 200, rows:", reqBody.rows.length);

  const actRes = await fetch(`${BASE}/api/admin/activity/?limit=5`, {
    headers: { Cookie: `sid=${adminSid}` },
  });
  if (!actRes.ok) {
    throw new Error(`Admin activity query failed: ${actRes.status}`);
  }
  const actBody = await actRes.json();
  if (!Array.isArray(actBody.rows)) {
    throw new Error("Unexpected activity response");
  }
  console.log("GET /api/admin/activity → 200, rows:", actBody.rows.length);

  const sseRes = await fetch(`${BASE}/api/admin/stream/requests/`, {
    headers: { Cookie: `sid=${adminSid}` },
  });
  if (sseRes.status !== 200) {
    throw new Error(`Admin SSE failed: ${sseRes.status}`);
  }
  const reader = sseRes.body.getReader();
  const { value } = await reader.read();
  reader.cancel().catch(() => {});
  if (!new TextDecoder().decode(value).includes("data:")) {
    throw new Error("SSE missing data replay");
  }
  console.log("admin requests SSE → 200");

  console.log("\nPhase 6 tests passed.");
}

main()
  .catch((err) => {
    console.error("Phase 6 tests failed:", err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
    await redis.quit();
  });
