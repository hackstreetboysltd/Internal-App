import Redis from "ioredis";
import { isServerlessRuntime, normalizeRedisUrl } from "@/lib/server/cloudProviders";

/** @type {Redis | null} */
let redis = null;

/**
 * Options for ioredis. Upstash uses `rediss://` (TLS) from the console.
 * @returns {import('ioredis').RedisOptions}
 */
export function getRedisOptions() {
  const serverless = isServerlessRuntime();
  return {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    enableReadyCheck: true,
    // Fail fast on cold Vercel invocations instead of queuing offline commands.
    enableOfflineQueue: !serverless,
    connectTimeout: serverless ? 10_000 : 5_000,
  };
}

/**
 * Shared Redis client for sessions, rate limits, pub/sub.
 * @returns {Redis}
 */
export function getRedis() {
  const raw = process.env.REDIS_URL;
  if (!raw) {
    throw new Error("REDIS_URL is not set");
  }
  const url = normalizeRedisUrl(raw);
  if (!redis) {
    redis = new Redis(url, getRedisOptions());
  }
  return redis;
}

/** Resolved Redis URL (TLS-normalized for Upstash). */
export function getRedisUrl() {
  const raw = process.env.REDIS_URL;
  if (!raw) {
    throw new Error("REDIS_URL is not set");
  }
  return normalizeRedisUrl(raw);
}

/** Ping Redis; returns latency in ms. */
export async function pingRedis() {
  const client = getRedis();
  if (client.status !== "ready") {
    await client.connect();
  }
  const start = Date.now();
  const pong = await client.ping();
  if (pong !== "PONG") {
    throw new Error(`Unexpected Redis ping response: ${pong}`);
  }
  return Date.now() - start;
}

/** Close Redis (tests / graceful shutdown). */
export async function closeRedis() {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
