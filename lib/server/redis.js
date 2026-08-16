import Redis from "ioredis";
import { isServerlessRuntime, normalizeRedisUrl } from "@/lib/server/cloudProviders";

/** @type {Redis | null} */
let redis = null;
/** @type {Promise<Redis> | null} */
let connecting = null;

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

/**
 * Connect once; concurrent callers share the same in-flight connect.
 * ioredis throws if connect() is called while status is connecting/connect/ready.
 * @returns {Promise<Redis>}
 */
export async function ensureRedisConnected() {
  const client = getRedis();
  if (client.status === "ready") return client;
  if (connecting) return connecting;

  connecting = (async () => {
    try {
      if (client.status === "wait" || client.status === "end" || client.status === "close") {
        await client.connect();
      } else if (client.status !== "ready") {
        await waitUntilReady(client);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!/already connecting\/connected/i.test(message)) {
        throw err;
      }
      await waitUntilReady(client);
    }
    return client;
  })().finally(() => {
    connecting = null;
  });

  return connecting;
}

/**
 * @param {Redis} client
 * @returns {Promise<void>}
 */
function waitUntilReady(client) {
  if (client.status === "ready") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onReady = () => {
      client.off("error", onError);
      resolve();
    };
    const onError = (err) => {
      client.off("ready", onReady);
      reject(err);
    };
    client.once("ready", onReady);
    client.once("error", onError);
    if (client.status === "ready") {
      client.off("ready", onReady);
      client.off("error", onError);
      resolve();
    }
  });
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
  const client = await ensureRedisConnected();
  const start = Date.now();
  const pong = await client.ping();
  if (pong !== "PONG") {
    throw new Error(`Unexpected Redis ping response: ${pong}`);
  }
  return Date.now() - start;
}

/** Close Redis (tests / graceful shutdown). */
export async function closeRedis() {
  connecting = null;
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
