import { NextResponse } from "next/server";
import { assertValidCollectionName } from "@/lib/server/collectionNames";
import { getCollectionManifest } from "@/lib/server/collectionsDb";
import { buildRateLimitKey, checkRateLimit } from "@/lib/server/rateLimit";
import { isEmailAllowed } from "@/lib/server/whitelist";
import { withApi } from "@/lib/server/withApi";

export const dynamic = "force-dynamic";

/**
 * @param {{ email?: string } | null | undefined} session
 */
async function ensureAllowedReader(session) {
  if (!session?.email) return false;
  return isEmailAllowed(session.email);
}

export const GET = withApi(async (request, routeContext, { session }) => {
  const { collection } = await routeContext.params;
  assertValidCollectionName(collection);

  if (!(await ensureAllowedReader(session))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const syncSpec = buildRateLimitKey("sync", request, session, { collection });
  if (syncSpec) {
    const syncRl = await checkRateLimit(syncSpec.key, syncSpec.limit);
    if (!syncRl.allowed) {
      const response = NextResponse.json({ error: "Too many requests" }, { status: 429 });
      response.headers.set("Retry-After", String(syncRl.retryAfter));
      return response;
    }
  }

  const manifest = await getCollectionManifest(collection);
  return NextResponse.json(manifest);
}, { auth: true, rateLimits: ["ip", "user"] });
