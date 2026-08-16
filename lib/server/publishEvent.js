import {
  CHANNEL_API_ACTIVITY,
  CHANNEL_API_REQUESTS,
  getSseBufferSize,
  STREAM_API_ACTIVITY,
  STREAM_API_REQUESTS,
} from "@/lib/server/constants";
import { ensureRedisConnected } from "@/lib/server/redis";

/**
 * @param {string} channel
 * @param {string} stream
 * @param {Record<string, unknown>} event
 */
export async function publishEvent(channel, stream, event) {
  const redis = await ensureRedisConnected();

  const payload = JSON.stringify({
    ...event,
    timestamp: event.timestamp || new Date().toISOString(),
  });

  const bufferSize = getSseBufferSize();
  await redis.publish(channel, payload);
  await redis.xadd(stream, "MAXLEN", "~", String(bufferSize), "*", "data", payload);
}

/**
 * @param {Record<string, unknown>} event
 */
export async function publishApiRequestEvent(event) {
  await publishEvent(CHANNEL_API_REQUESTS, STREAM_API_REQUESTS, event);
}

/**
 * @param {Record<string, unknown>} event
 */
export async function publishActivityEvent(event) {
  await publishEvent(CHANNEL_API_ACTIVITY, STREAM_API_ACTIVITY, event);
}

/**
 * Read recent events from a Redis stream for SSE replay.
 * @param {string} stream
 * @param {number} count
 */
export async function readStreamReplay(stream, count) {
  const redis = await ensureRedisConnected();

  const entries = await redis.xrevrange(stream, "+", "-", "COUNT", count);
  const events = [];

  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const [, fields] = entries[i];
    const dataIndex = fields.indexOf("data");
    if (dataIndex >= 0 && fields[dataIndex + 1]) {
      try {
        events.push(JSON.parse(fields[dataIndex + 1]));
      } catch {
        /* skip malformed */
      }
    }
  }

  return events;
}
