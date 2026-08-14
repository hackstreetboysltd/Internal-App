/**
 * Phase 3 smoke test — Postgres data API via portal session.
 * Usage: node scripts/test-phase3.mjs [baseUrl]
 */
import { randomUUID } from "crypto";
import Redis from "ioredis";
import pg from "pg";

const BASE = process.argv[2] || "http://localhost:3002/Internal-App";
const DATABASE_URL = process.env.DATABASE_URL || "postgresql://portal:portal@localhost:5432/portal";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

const pool = new pg.Pool({ connectionString: DATABASE_URL });
const redis = new Redis(REDIS_URL);

async function createSession(roles = ["user"]) {
  const email = "phase3-test@example.com";
  const uid = randomUUID();
  const sid = randomUUID();

  await pool.query(
    `INSERT INTO users (id, email, name, approved)
     VALUES ($1, $2, $3, true)
     ON CONFLICT (email) DO UPDATE SET approved = true`,
    [uid, email, "Phase 3 Tester"],
  );
  const userRes = await pool.query(`SELECT id FROM users WHERE email = $1`, [email]);
  const userId = userRes.rows[0].id;

  await pool.query(
    `UPDATE role_access SET emails = '["phase3-test@example.com"]'::jsonb WHERE id = 'allowed'`,
  );

  const session = {
    sid,
    uid: userId,
    email,
    name: "Phase 3 Tester",
    avatar: "",
    roles,
    sessionId: "p3",
    createdAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    needsProfileSync: false,
  };

  await redis.setex(`session:${sid}`, 604800, JSON.stringify(session));
  return sid;
}

async function main() {
  console.log("Phase 3 tests against", BASE);
  const sid = await createSession();

  const settingsPayload = [{ id: "global", emailNotificationsPaused: false, testMarker: "phase3" }];

  const putRes = await fetch(`${BASE}/api/data/settings/`, {
    method: "PUT",
    headers: { Cookie: `sid=${sid}`, "Content-Type": "application/json" },
    body: JSON.stringify(settingsPayload),
  });
  if (!putRes.ok) {
    throw new Error(`PUT settings failed: ${putRes.status} ${await putRes.text()}`);
  }
  console.log("PUT settings → 200");

  const getRes = await fetch(`${BASE}/api/data/settings/`, {
    headers: { Cookie: `sid=${sid}` },
  });
  if (!getRes.ok) {
    throw new Error(`GET settings failed: ${getRes.status}`);
  }
  const data = await getRes.json();
  if (!Array.isArray(data) || !data.some((r) => r.testMarker === "phase3")) {
    throw new Error("GET settings did not return saved marker");
  }
  console.log("GET settings round-trip OK");

  const dbCount = await pool.query(
    `SELECT COUNT(*)::int AS n FROM collection_items WHERE collection_name = 'settings'`,
  );
  if (dbCount.rows[0].n < 1) {
    throw new Error("collection_items has no settings rows");
  }
  console.log("Postgres collection_items rows:", dbCount.rows[0].n);

  const goalsRes = await fetch(`${BASE}/api/data/goals/`, { headers: { Cookie: `sid=${sid}` } });
  if (!goalsRes.ok) {
    throw new Error(`GET goals seed failed: ${goalsRes.status}`);
  }
  const goals = await goalsRes.json();
  if (!Array.isArray(goals) || goals.length === 0) {
    throw new Error("Goals seed/interceptor did not return data");
  }
  console.log("GET goals seed OK, count:", goals.length);

  const noAuth = await fetch(`${BASE}/api/data/settings/`);
  if (noAuth.status !== 401) {
    throw new Error(`Expected 401 without session, got ${noAuth.status}`);
  }
  console.log("unauthenticated GET → 401");

  console.log("\nPhase 3 tests passed.");
}

main()
  .catch((err) => {
    console.error("Phase 3 tests failed:", err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
    await redis.quit();
  });
