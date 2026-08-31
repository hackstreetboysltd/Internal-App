import { Pool } from "pg";
import dns from "node:dns";
import { parse } from "pg-connection-string";
import { isServerlessRuntime } from "@/lib/server/cloudProviders";

/** @type {Pool | null} */
let pool = null;
/** @type {Promise<Pool> | null} */
let poolReady = null;

/**
 * Neon / Supabase require TLS. Local Docker does not.
 * @param {string} url
 */
function wantsSsl(url) {
  if (process.env.DATABASE_SSL === "0") return false;
  if (process.env.DATABASE_SSL === "1") return true;
  return /sslmode=require|neon\.tech|supabase\.co/i.test(url);
}

function isCloudDatabaseUrl(url) {
  return /neon\.tech|supabase\.co/i.test(url);
}

/**
 * @param {string} url
 */
async function buildPoolConfig(url) {
  const serverless = isServerlessRuntime();
  const ssl = wantsSsl(url)
    ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "0" }
    : undefined;

  if (isCloudDatabaseUrl(url) && !serverless) {
    const parsed = parse(url);
    const hostname = parsed.host || "";
    let host = hostname;
    if (hostname) {
      try {
        const addresses = await dns.promises.resolve4(hostname);
        if (addresses[0]) host = addresses[0];
      } catch {
        /* fall back to hostname */
      }
    }

    return {
      host,
      port: Number(parsed.port) || 5432,
      user: parsed.user,
      password: parsed.password,
      database: parsed.database,
      ssl: ssl ? { ...ssl, servername: hostname } : undefined,
      max: 10,
      idleTimeoutMillis: 30_000,
    };
  }

  return {
    connectionString: url,
    max: serverless ? 1 : 10,
    idleTimeoutMillis: serverless ? 1000 : 30_000,
    ssl,
  };
}

async function createPool() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  return new Pool(await buildPoolConfig(url));
}

/**
 * Shared PostgreSQL pool for API routes and server code.
 * @returns {Promise<Pool>}
 */
export async function getPool() {
  if (pool) return pool;
  if (!poolReady) {
    poolReady = createPool().then((p) => {
      pool = p;
      return p;
    });
  }
  return poolReady;
}

/**
 * @param {string} text
 * @param {unknown[]} [params]
 */
export async function query(text, params) {
  const activePool = await getPool();
  return activePool.query(text, params);
}

/** Ping Postgres; returns latency in ms. */
export async function pingPostgres() {
  const start = Date.now();
  await query("SELECT 1 AS ok");
  return Date.now() - start;
}

/** Close pool (tests / graceful shutdown). */
export async function closePool() {
  poolReady = null;
  if (pool) {
    await pool.end();
    pool = null;
  }
}
