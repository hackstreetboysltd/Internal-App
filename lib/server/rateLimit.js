import { randomUUID } from "crypto";
import { getRateLimits } from "@/lib/server/constants";
import { getClientIp } from "@/lib/server/requestMeta";
import { getRedis } from "@/lib/server/redis";

const WINDOW_MS = 60_000;

/**
 * Sliding-window rate limit using a Redis sorted set.
 * @param {string} key
 * @param {number} limit — max requests per minute
 * @param {number} [windowMs]
 */
export async function checkRateLimit(key, limit, windowMs = WINDOW_MS) {
  const redis = getRedis();
  if (redis.status !== "ready") {
    await redis.connect();
  }

  const now = Date.now();
  const windowStart = now - windowMs;

  await redis.zremrangebyscore(key, 0, windowStart);
  const count = await redis.zcard(key);

  if (count >= limit) {
    const oldest = await redis.zrange(key, 0, 0, "WITHSCORES");
    let retryAfter = Math.ceil(windowMs / 1000);
    if (oldest.length >= 2) {
      retryAfter = Math.max(1, Math.ceil((Number(oldest[1]) + windowMs - now) / 1000));
    }
    return { allowed: false, count, retryAfter };
  }

  await redis.zadd(key, now, `${now}:${randomUUID()}`);
  await redis.pexpire(key, windowMs);

  return { allowed: true, count: count + 1, retryAfter: 0 };
}

/**
 * @param {'ip' | 'user' | 'sync' | 'activity' | 'write'} scope
 */
export function getScopeLimit(scope) {
  const limits = getRateLimits();
  return limits[scope] ?? limits.ip;
}

/**
 * @param {'ip' | 'user' | 'sync' | 'activity' | 'write'} scope
 * @param {import('next/server').NextRequest} request
 * @param {{ uid?: string } | null | undefined} session
 * @param {{ collection?: string } | undefined} extra
 */
export function buildRateLimitKey(scope, request, session, extra = {}) {
  const ip = getClientIp(request);

  switch (scope) {
    case "ip":
      return { key: `ratelimit:ip:${ip}`, limit: getScopeLimit("ip") };
    case "user":
      if (!session?.uid) return null;
      return { key: `ratelimit:user:${session.uid}`, limit: getScopeLimit("user") };
    case "sync":
      if (!session?.uid) return null;
      return {
        key: `ratelimit:sync:${session.uid}:${extra.collection || "all"}`,
        limit: getScopeLimit("sync"),
      };
    case "activity":
      if (!session?.uid) return null;
      return { key: `ratelimit:activity:${session.uid}`, limit: getScopeLimit("activity") };
    case "write":
      if (!session?.uid) return null;
      return {
        key: `ratelimit:write:${session.uid}:${extra.collection || "all"}`,
        limit: getScopeLimit("write"),
      };
    default:
      return { key: `ratelimit:ip:${ip}`, limit: getScopeLimit("ip") };
  }
}

/**
 * @param {import('next/server').NextRequest} request
 * @param {{ uid?: string } | null | undefined} session
 * @param {Array<'ip' | 'user' | 'sync' | 'activity' | 'write'>} scopes
 * @param {{ collection?: string } | undefined} extra
 */
export async function enforceRateLimits(request, session, scopes, extra = {}) {
  for (const scope of scopes) {
    const spec = buildRateLimitKey(scope, request, session, extra);
    if (!spec) continue;
    const result = await checkRateLimit(spec.key, spec.limit);
    if (!result.allowed) {
      return result;
    }
  }
  return { allowed: true, retryAfter: 0 };
}
