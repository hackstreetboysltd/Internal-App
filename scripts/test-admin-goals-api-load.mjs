/**
 * Integration: admin module loads use /api/data (bypass sync cache), not delta sync.
 * Usage: node scripts/test-admin-goals-api-load.mjs [baseUrl]
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import Redis from "ioredis";

function loadEnv() {
  try {
    const raw = readFileSync(".env.local", "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {
    /* ignore */
  }
}

loadEnv();

const BASE = (process.argv[2] || "http://localhost:3000/Internal-App").replace(/\/$/, "");
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || "kakaiphil@gmail.com";

async function createAdminSession(redis) {
  const sid = randomUUID();
  const session = {
    sid,
    uid: randomUUID(),
    email: ADMIN_EMAIL,
    name: "Admin Goals Load Test",
    avatar: "",
    roles: ["admin"],
    sessionId: "admin-goals-load",
    createdAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    needsProfileSync: false,
  };
  await redis.setex(`session:${sid}`, 3600, JSON.stringify(session));
  return sid;
}

async function getJson(path, sid) {
  const started = Date.now();
  const res = await fetch(`${BASE}${path}`, {
    headers: { Cookie: `sid=${sid}` },
    cache: "no-store",
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, ms: Date.now() - started, body };
}

async function main() {
  console.log("Admin module API load against", BASE);
  const redis = new Redis(REDIS_URL);
  const sid = await createAdminSession(redis);

  const modules = ["apps", "skills", "procedures", "goals", "calendar", "meetings", "documents", "profile"];
  for (const name of modules) {
    const path = `/api/data/${name}/?admin=1`;
    const r = await getJson(path, sid);
    if (r.status !== 200 || !Array.isArray(r.body)) {
      console.error("FAIL", path, r.status, typeof r.body === "string" ? r.body.slice(0, 200) : r.body);
      process.exitCode = 1;
      continue;
    }
    console.log(`OK ${r.ms}ms ${name} rows=${r.body.length}`);
  }

  for (const name of ["apps", "goals", "skills"]) {
    const r = await getJson(`/api/data/pending_${name}/?admin=1`, sid);
    if (r.status !== 200 || !Array.isArray(r.body)) {
      console.error("FAIL pending", name, r.status);
      process.exitCode = 1;
    } else {
      console.log(`OK pending_${name} rows=${r.body.length}`);
    }
  }

  await redis.quit();
  if (process.exitCode) {
    console.error("admin module API load FAILED");
    process.exit(process.exitCode);
  }
  console.log("ok — admin module API load path healthy");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
