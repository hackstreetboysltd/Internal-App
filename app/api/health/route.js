import { withApi } from "@/lib/server/withApi";
import { pingPostgres } from "@/lib/server/db";
import { pingRedis } from "@/lib/server/redis";
import {
  detectPostgresProvider,
  detectRedisProvider,
  postgresWarnings,
  redisWarnings,
} from "@/lib/server/cloudProviders";

export const dynamic = "force-dynamic";

async function handler() {
  const databaseUrl = process.env.DATABASE_URL;
  const redisUrl = process.env.REDIS_URL;

  const checks = {
    postgres: { ok: false, latencyMs: null, error: null },
    redis: { ok: false, latencyMs: null, error: null },
  };

  try {
    checks.postgres.latencyMs = await pingPostgres();
    checks.postgres.ok = true;
  } catch (err) {
    checks.postgres.error = err instanceof Error ? err.message : String(err);
  }

  try {
    checks.redis.latencyMs = await pingRedis();
    checks.redis.ok = true;
  } catch (err) {
    checks.redis.error = err instanceof Error ? err.message : String(err);
  }

  const ok = checks.postgres.ok && checks.redis.ok;
  const warnings = [...postgresWarnings(databaseUrl), ...redisWarnings(redisUrl)];

  return Response.json(
    {
      ok,
      service: "internal-portal",
      phase: 2,
      providers: {
        postgres: detectPostgresProvider(databaseUrl),
        redis: detectRedisProvider(redisUrl),
      },
      warnings: warnings.length ? warnings : undefined,
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: ok ? 200 : 503 },
  );
}

export const GET = withApi(handler, { auth: false, rateLimits: ["ip"] });
