import { NextResponse } from "next/server";
import { assertValidCollectionName } from "@/lib/server/collectionNames";
import {
  getCollectionManifest,
  listCollectionItems,
} from "@/lib/server/collectionsDb";
import { filterChannelItemsForActor, filterItemsForActor } from "@/lib/server/authorize";
import { filterMessageItemsForActor } from "@/lib/channels";
import { collectionUsesSecurityLevel } from "@/lib/securityLevel";
import { buildRateLimitKey, checkRateLimit } from "@/lib/server/rateLimit";
import { effectiveAdminView } from "@/lib/server/adminRole";
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

function actorFromSession(session) {
  return {
    name: session?.name,
    email: session?.email,
    roles: Array.isArray(session?.roles) ? session.roles : [],
  };
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
  const needsFilter =
    collection === "channels"
    || collection === "messages"
    || collectionUsesSecurityLevel(collection);
  if (!needsFilter) {
    return NextResponse.json(manifest);
  }

  const actor = actorFromSession(session);
  const items = await listCollectionItems(collection);
  let visible;
  if (collection === "channels") {
    visible = filterChannelItemsForActor(items, actor, {
      adminSeesAll: effectiveAdminView(request, session),
    });
  } else if (collection === "messages") {
    const channels = await listCollectionItems("channels");
    visible = filterMessageItemsForActor(items, actor, channels);
  } else {
    visible = filterItemsForActor(items, actor);
  }
  const readable = new Set(visible.map((item) => String(item && item.id)));
  /** @type {Record<string, string>} */
  const filtered = {};
  for (const [id, updatedAt] of Object.entries(manifest || {})) {
    if (readable.has(String(id))) filtered[id] = updatedAt;
  }
  return NextResponse.json(filtered);
}, { auth: true, rateLimits: ["ip", "user"] });
