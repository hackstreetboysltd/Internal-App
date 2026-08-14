import { Pool } from "pg";
import { isServerlessRuntime } from "@/lib/server/cloudProviders";

/** @type {Pool | null} */
let pool = null;

/**
 * Neon / Supabase require TLS. Local Docker does not.
 * @param {string} url
 */
function wantsSsl(url) {
  if (process.env.DATABASE_SSL === "0") return false;
  if (process.env.DATABASE_SSL === "1") return true;
  return /sslmode=require|neon\.tech|supabase\.co/i.test(url);
}

/**
 * Shared PostgreSQL pool for API routes and server code.
 * @returns {Pool}
 */
export function getPool() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  if (!pool) {
    const serverless = isServerlessRuntime();
    pool = new Pool({
      connectionString: url,
      max: serverless ? 1 : 10,
      idleTimeoutMillis: serverless ? 1000 : 30_000,
      ssl: wantsSsl(url)
        ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "0" }
        : undefined,
    });
  }
  return pool;
}

/**
 * @param {string} text
 * @param {unknown[]} [params]
 */
export async function query(text, params) {
  return getPool().query(text, params);
}

/** Ping Postgres; returns latency in ms. */
export async function pingPostgres() {
  const start = Date.now();
  await query("SELECT 1 AS ok");
  return Date.now() - start;
}

/** Close pool (tests / graceful shutdown). */
export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
