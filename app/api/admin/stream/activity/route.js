import { withApi } from "@/lib/server/withApi";
import { createSseResponse, SSE_ACTIVITY } from "@/lib/server/sseStream";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/admin/stream/activity — SSE live activity feed (admin only).
 */
export const GET = withApi(
  async (request) => createSseResponse(request, SSE_ACTIVITY),
  { auth: true, admin: true, rateLimits: ["ip", "user"] },
);
