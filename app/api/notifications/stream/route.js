import { withApi } from "@/lib/server/withApi";
import { createSseResponse, SSE_NOTIFICATIONS } from "@/lib/server/sseStream";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/** GET /api/notifications/stream — SSE live notification events. */
export const GET = withApi(
  async (request) => createSseResponse(request, SSE_NOTIFICATIONS),
  { auth: true, rateLimits: ["ip", "user"] },
);
