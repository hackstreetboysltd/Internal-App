/**
 * Quick smoke test: Postgres + Redis from .env.local, profile row count.
 * Usage: node scripts/verify-local.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import dns from "node:dns";
import pg from "pg";
import { parse } from "pg-connection-string";
import Redis from "ioredis";

dns.setDefaultResultOrder("ipv4first");
if (process.env.NODE_ENV !== "production") {
  dns.setServers(["8.8.8.8", "1.1.1.1", "8.8.4.4"]);
}

function loadEnvLocal() {
  const path = fileURLToPath(new URL("../.env.local", import.meta.url));
  const env = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

async function neonPoolConfig(databaseUrl) {
  const parsed = parse(databaseUrl);
  const hostname = parsed.host || "";
  let host = hostname;
  if (hostname) {
    const addresses = await dns.promises.resolve4(hostname);
    if (addresses[0]) host = addresses[0];
  }
  return {
    host,
    port: Number(parsed.port) || 5432,
    user: parsed.user,
    password: parsed.password,
    database: parsed.database,
    ssl: { rejectUnauthorized: true, servername: hostname },
    max: 1,
  };
}

const env = loadEnvLocal();
const databaseUrl = env.DATABASE_URL;
const redisUrl = env.REDIS_URL;

if (!databaseUrl) {
  console.error("FAIL: DATABASE_URL missing in .env.local");
  process.exit(1);
}

const isLocalDb = /localhost|127\.0\.0\.1/i.test(databaseUrl);
const isNeon = /neon\.tech/i.test(databaseUrl);

console.log("DATABASE_URL target:", isNeon ? "neon" : isLocalDb ? "local-docker" : "custom");
console.log("REDIS_URL target:", /upstash\.io/i.test(redisUrl || "") ? "upstash" : "local");

const pool = isNeon
  ? new pg.Pool(await neonPoolConfig(databaseUrl))
  : new pg.Pool({
      connectionString: databaseUrl,
      max: 1,
    });

let failed = false;

try {
  const ping = await pool.query("SELECT 1 AS ok");
  if (ping.rows[0]?.ok !== 1) throw new Error("unexpected ping");
  console.log("Postgres: OK");

  const profiles = await pool.query(
    `SELECT count(*)::int AS n FROM collection_items
     WHERE collection_name = 'profile' AND deleted_at IS NULL`,
  );
  console.log("Profile rows:", profiles.rows[0]?.n ?? 0);

  const allowed = await pool.query(`SELECT emails FROM role_access WHERE id = 'allowed'`);
  const emails = allowed.rows[0]?.emails;
  console.log("Allowed emails:", Array.isArray(emails) ? emails.length : 0);
} catch (err) {
  console.error("Postgres FAIL:", err.message || err);
  failed = true;
}

await pool.end();

if (redisUrl) {
  const redis = new Redis(redisUrl, { maxRetriesPerRequest: 1, connectTimeout: 10_000 });
  try {
    const pong = await redis.ping();
    console.log("Redis:", pong);
  } catch (err) {
    console.error("Redis FAIL:", err.message || err);
    failed = true;
  }
  redis.disconnect();
}

if (failed) {
  process.exit(1);
}
console.log("verify-local: all checks passed");
