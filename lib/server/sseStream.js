import Redis from "ioredis";
import {
  CHANNEL_API_ACTIVITY,
  CHANNEL_API_REQUESTS,
  CHANNEL_PORTAL_NOTIFICATIONS,
  STREAM_API_ACTIVITY,
  STREAM_API_REQUESTS,
  STREAM_PORTAL_NOTIFICATIONS,
} from "@/lib/server/constants";
import { readStreamReplay } from "@/lib/server/publishEvent";
import { getRedisOptions, getRedisUrl } from "@/lib/server/redis";

/**
 * Create an SSE Response subscribed to a Redis channel with stream replay.
 * @param {import('next/server').NextRequest} request
 * @param {{ channel: string, stream: string, replay?: number }} config
 */
export function createSseResponse(request, config) {
  const encoder = new TextEncoder();
  const replayCount = config.replay ?? 50;

  const stream = new ReadableStream({
    async start(controller) {
      /** @type {Redis | null} */
      let subscriber = null;
      /** @type {ReturnType<typeof setInterval> | null} */
      let heartbeat = null;

      const send = (payload) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      const cleanup = () => {
        if (heartbeat) clearInterval(heartbeat);
        if (subscriber) {
          subscriber.unsubscribe(config.channel).catch(() => {});
          subscriber.quit().catch(() => {});
        }
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      try {
        const replay = await readStreamReplay(config.stream, replayCount);
        replay.forEach(send);

        subscriber = new Redis(getRedisUrl(), getRedisOptions());
        await subscriber.subscribe(config.channel);
        subscriber.on("message", (_channel, message) => {
          try {
            send(JSON.parse(message));
          } catch {
            send({ raw: message });
          }
        });

        heartbeat = setInterval(() => {
          controller.enqueue(encoder.encode(": ping\n\n"));
        }, 15000);

        request.signal.addEventListener("abort", cleanup);
      } catch (err) {
        send({ error: err instanceof Error ? err.message : String(err) });
        cleanup();
      }
    },
    cancel() {
      /* cleanup handled via abort signal */
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

export const SSE_REQUESTS = {
  channel: CHANNEL_API_REQUESTS,
  stream: STREAM_API_REQUESTS,
};

export const SSE_ACTIVITY = {
  channel: CHANNEL_API_ACTIVITY,
  stream: STREAM_API_ACTIVITY,
};

export const SSE_NOTIFICATIONS = {
  channel: CHANNEL_PORTAL_NOTIFICATIONS,
  stream: STREAM_PORTAL_NOTIFICATIONS,
  replay: 20,
};
