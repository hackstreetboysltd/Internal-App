/**
 * Phase 8 smoke test — session kill, rotation, retention.
 * Usage: node scripts/test-phase8.mjs [baseUrl]
 */
import { randomUUID } from "crypto";
import Redis from "ioredis";
import pg from "pg";

const BASE = process.argv[2] || "http://localhost:3001/Internal-App";
const DATABASE_URL = process.env.DATABASE_URL || "postgresql://portal:portal@localhost:5432/portal";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

const pool = new pg.Pool({ connectionString: DATABASE_URL });
const redis = new Redis(REDIS_URL);

async function createSession({ email, roles, createdAt }) {
  const uid = randomUUID();
  const sid = randomUUID();

  await pool.query(
    `INSERT INTO users (id, email, name, approved)
     VALUES ($1, $2, $3, true)
     ON CONFLICT (email) DO UPDATE SET approved = true`,
    [uid, email, "Phase 8 Tester"],
  );
  const userRes = await pool.query(`SELECT id FROM users WHERE email = $1`, [email]);
  const userId = userRes.rows[0].id;

  const session = {
    sid,
    uid: userId,
    email,
    name: "Phase 8 Tester",
    avatar: "",
    roles,
    sessionId: "p8",
    createdAt: createdAt || new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    needsProfileSync: false,
  };

  await redis.setex(`session:${sid}`, 604800, JSON.stringify(session));
  await redis.sadd(`user_sessions:${userId}`, sid);
  await redis.expire(`user_sessions:${userId}`, 604800);
  return { sid, userId, email };
}

async function main() {
  console.log("Phase 8 tests against", BASE);

  const user = await createSession({ email: "phase8-user@example.com", roles: ["user"] });
  const admin = await createSession({
    email: "phase8-admin@example.com",
    roles: ["user", "admin"],
  });

  const forbidden = await fetch(`${BASE}/api/admin/sessions/${user.sid}/`, {
    method: "DELETE",
    headers: { Cookie: `sid=${user.sid}` },
  });
  if (forbidden.status !== 403) {
    throw new Error(`Expected 403 for non-admin session kill, got ${forbidden.status}`);
  }
  console.log("non-admin DELETE session → 403");

  const listed = await fetch(
    `${BASE}/api/admin/sessions/?email=${encodeURIComponent(user.email)}`,
    { headers: { Cookie: `sid=${admin.sid}` } },
  );
  if (!listed.ok) {
    throw new Error(`List sessions failed: ${listed.status}`);
  }
  const listBody = await listed.json();
  if (!listBody.rows?.some((row) => row.sid === user.sid)) {
    throw new Error("Admin session list missing target sid");
  }
  console.log("GET /api/admin/sessions → 200");

  const killed = await fetch(`${BASE}/api/admin/sessions/${user.sid}/`, {
    method: "DELETE",
    headers: { Cookie: `sid=${admin.sid}` },
  });
  if (!killed.ok) {
    throw new Error(`Session kill failed: ${killed.status} ${await killed.text()}`);
  }
  const dead = await fetch(`${BASE}/api/auth/me/`, {
    headers: { Cookie: `sid=${user.sid}` },
  });
  if (dead.status !== 401) {
    throw new Error(`Expected 401 after session kill, got ${dead.status}`);
  }
  console.log("admin session kill → subsequent /api/auth/me 401");

  const stale = await createSession({
    email: "phase8-rotate@example.com",
    roles: ["user"],
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  });
  const rotateRes = await fetch(`${BASE}/api/auth/me/`, {
    headers: { Cookie: `sid=${stale.sid}` },
  });
  if (!rotateRes.ok) {
    throw new Error(`Rotation /api/auth/me failed: ${rotateRes.status}`);
  }
  const rotateBody = await rotateRes.json();
  if (!rotateBody.rotated) {
    throw new Error("Expected rotated=true for stale session");
  }
  const setCookie = rotateRes.headers.get("set-cookie") || "";
  if (!setCookie.includes("sid=")) {
    throw new Error("Rotated session did not Set-Cookie");
  }
  const newSidMatch = setCookie.match(/sid=([^;]+)/);
  if (!newSidMatch?.[1]) {
    throw new Error("Could not parse rotated sid from Set-Cookie");
  }
  const newSid = newSidMatch[1];

  const oldRaw = await redis.get(`session:${stale.sid}`);
  if (!oldRaw) {
    throw new Error("Expected old sid bridge key after rotation");
  }
  const oldBridge = JSON.parse(oldRaw);
  if (oldBridge._rotatedTo !== newSid) {
    throw new Error(`Old sid bridge should point to new sid, got ${oldBridge._rotatedTo ?? "null"}`);
  }

  const newRaw = await redis.get(`session:${newSid}`);
  if (!newRaw) {
    throw new Error("New sid missing after rotation");
  }
  const newSession = JSON.parse(newRaw);
  if (newSession.email !== stale.email) {
    throw new Error("Rotated session email mismatch");
  }
  if (newSession._rotatedTo) {
    throw new Error("New session should not be a bridge record");
  }

  const bridged = await fetch(`${BASE}/api/auth/me/`, {
    headers: { Cookie: `sid=${stale.sid}` },
  });
  if (!bridged.ok) {
    throw new Error(`Expected old sid bridge to resolve, got ${bridged.status}`);
  }

  console.log("daily session rotation → new cookie, old sid bridged to new sid");

  const oldId = randomUUID();
  await pool.query(
    `INSERT INTO api_request_logs (
       request_id, method, path, query, status, duration_ms, rate_limited, created_at
     ) VALUES ($1, 'GET', '/api/health', '{}'::jsonb, 200, 1, false, now() - interval '40 days')`,
    [oldId],
  );
  const retainRes = await fetch(`${BASE}/api/admin/jobs/retention/`, {
    method: "POST",
    headers: { Cookie: `sid=${admin.sid}` },
  });
  if (!retainRes.ok) {
    throw new Error(`Retention job failed: ${retainRes.status} ${await retainRes.text()}`);
  }
  const leftover = await pool.query(
    `SELECT COUNT(*)::int AS n FROM api_request_logs WHERE request_id = $1`,
    [oldId],
  );
  if (leftover.rows[0].n !== 0) {
    throw new Error("Retention did not delete 40-day-old API log");
  }
  const hourly = await pool.query(`SELECT COUNT(*)::int AS n FROM log_hourly_stats`);
  if (hourly.rows[0].n < 1) {
    throw new Error("Hourly rollup produced no rows");
  }
  console.log("retention + hourly rollup OK");

  const burst = await Promise.all(
    Array.from({ length: 20 }, () => fetch(`${BASE}/api/health/`)),
  );
  if (burst.some((res) => res.status !== 200)) {
    throw new Error("Concurrent health checks did not all return 200");
  }
  console.log("concurrent health burst → 200");

  console.log("\nPhase 8 tests passed.");
}

main()
  .catch((err) => {
    console.error("Phase 8 tests failed:", err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
    await redis.quit();
  });
