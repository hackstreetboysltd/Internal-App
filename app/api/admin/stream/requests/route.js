import { withApi } from "@/lib/server/withApi";
import { createSseResponse, SSE_REQUESTS } from "@/lib/server/sseStream";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/admin/stream/requests — SSE live API request feed (admin only).
 */
export const GET = withApi(
  async (request) => createSseResponse(request, SSE_REQUESTS),
  { auth: true, admin: true, rateLimits: ["ip", "user"] },
);
