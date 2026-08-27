/**
 * Phase 4 smoke test — delta sync API.
 * Usage: node scripts/test-phase4.mjs [baseUrl]
 */
import { randomUUID } from "crypto";
import Redis from "ioredis";
import pg from "pg";

const BASE = process.argv[2] || "http://localhost:3002/Internal-App";
const DATABASE_URL = process.env.DATABASE_URL || "postgresql://portal:portal@localhost:5432/portal";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

const pool = new pg.Pool({ connectionString: DATABASE_URL });
const redis = new Redis(REDIS_URL);

async function createSession() {
  const email = "phase4-test@example.com";
  const uid = randomUUID();
  const sid = randomUUID();

  await pool.query(
    `INSERT INTO users (id, email, name, approved)
     VALUES ($1, $2, $3, true)
     ON CONFLICT (email) DO UPDATE SET approved = true`,
    [uid, email, "Phase 4 Tester"],
  );
  const userRes = await pool.query(`SELECT id FROM users WHERE email = $1`, [email]);
  const userId = userRes.rows[0].id;

  await pool.query(
    `UPDATE role_access SET emails = '["phase4-test@example.com"]'::jsonb, updated_at = now() WHERE id = 'allowed'`,
  );

  const session = {
    sid,
    uid: userId,
    email,
    name: "Phase 4 Tester",
    avatar: "",
    roles: ["user"],
    sessionId: "p4",
    createdAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    needsProfileSync: false,
  };

  await redis.setex(`session:${sid}`, 604800, JSON.stringify(session));
  return sid;
}

async function main() {
  console.log("Phase 4 tests against", BASE);
  const sid = await createSession();
  const headers = { Cookie: `sid=${sid}`, "Content-Type": "application/json" };

  await pool.query(`DELETE FROM collection_items WHERE collection_name = 'settings'`);

  const putRes = await fetch(`${BASE}/api/data/settings/`, {
    method: "PUT",
    headers,
    body: JSON.stringify([{ id: "global", testMarker: "phase4-v1" }]),
  });
  if (!putRes.ok) {
    throw new Error(`PUT settings failed: ${putRes.status}`);
  }
  console.log("PUT settings → 200");

  const fullSync = await fetch(`${BASE}/api/sync/settings/`, { headers });
  if (!fullSync.ok) {
    throw new Error(`Full sync failed: ${fullSync.status}`);
  }
  const full = await fullSync.json();
  if (!full.cursor || !Array.isArray(full.upserts) || full.upserts.length < 1) {
    throw new Error("Full sync missing upserts");
  }
  console.log("Full sync OK, upserts:", full.upserts.length, "cursor:", full.cursor);

  const emptyDelta = await fetch(`${BASE}/api/sync/settings/?since=${encodeURIComponent(full.cursor)}`, { headers });
  if (!emptyDelta.ok) {
    throw new Error(`Delta sync failed: ${emptyDelta.status}`);
  }
  const delta = await emptyDelta.json();
  if (delta.upserts.length !== 0 || delta.deletes.length !== 0) {
    throw new Error("Expected empty delta after fresh cursor");
  }
  console.log("Empty delta after cursor OK");

  await new Promise((r) => setTimeout(r, 50));

  const put2 = await fetch(`${BASE}/api/data/settings/`, {
    method: "PUT",
    headers,
    body: JSON.stringify([{ id: "global", testMarker: "phase4-v2" }]),
  });
  if (!put2.ok) {
    throw new Error(`PUT settings v2 failed: ${put2.status}`);
  }

  const changeDelta = await fetch(`${BASE}/api/sync/settings/?since=${encodeURIComponent(full.cursor)}`, { headers });
  if (!changeDelta.ok) {
    throw new Error(`Change delta failed: ${changeDelta.status}`);
  }
  const changed = await changeDelta.json();
  if (!changed.upserts.some((u) => u.data?.testMarker === "phase4-v2")) {
    throw new Error("Delta did not include updated marker");
  }
  console.log("Delta after update OK");

  const manifestRes = await fetch(`${BASE}/api/sync/settings/manifest/`, { headers });
  if (!manifestRes.ok) {
    throw new Error(`Manifest failed: ${manifestRes.status}`);
  }
  const manifest = await manifestRes.json();
  if (!manifest.global) {
    throw new Error("Manifest missing global id");
  }
  console.log("Manifest OK");

  const noAuth = await fetch(`${BASE}/api/sync/settings/`);
  if (noAuth.status !== 401) {
    throw new Error(`Expected 401 without session, got ${noAuth.status}`);
  }
  console.log("unauthenticated sync → 401");

  console.log("\nPhase 4 tests passed.");
}

main()
  .catch((err) => {
    console.error("Phase 4 tests failed:", err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
    await redis.quit();
  });
