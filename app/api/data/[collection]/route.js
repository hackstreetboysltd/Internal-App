import { NextResponse } from "next/server";
import { authorizeCollectionSave } from "@/lib/server/authorize";
import { isValidCollectionName } from "@/lib/server/collectionNames";
import {
  CollectionSaveError,
  getCollectionItem,
  listCollectionItems,
  mergeCollectionItemsAtomic,
  readCollection,
  replaceCollectionItemsAtomic,
} from "@/lib/server/collectionsDb";
import { buildRateLimitKey, checkRateLimit } from "@/lib/server/rateLimit";
import { effectiveAdminView } from "@/lib/server/adminRole";
import { isEmailAllowed } from "@/lib/server/whitelist";
import { dispatchCollectionNotifications } from "@/lib/server/notifications/dispatch";
import { invalidatePendingApprovalsCache } from "@/lib/server/notifications/pendingApprovals";
import { withApi } from "@/lib/server/withApi";

export const dynamic = "force-dynamic";

/**
 * @param {{ email?: string } | null | undefined} session
 */
async function ensureAllowedReader(session) {
  if (!session?.email) return false;
  return isEmailAllowed(session.email);
}

/**
 * @param {{ name?: string, email?: string, roles?: string[] } | null | undefined} session
 */
function actorFromSession(session) {
  return {
    name: session?.name,
    email: session?.email,
    roles: Array.isArray(session?.roles) ? session.roles : [],
  };
}

/**
 * @param {unknown[]} items
 */
async function channelsForMessageItems(items) {
  const ids = [
    ...new Set(
      items
        .filter((item) => item && typeof item === "object")
        .map((item) => {
          const raw = String(item.channel || "direct").trim().toLowerCase();
          return raw || "direct";
        }),
    ),
  ];
  const rows = await Promise.all(ids.map((id) => getCollectionItem("channels", id)));
  return rows.filter(Boolean);
}

export const GET = withApi(async (request, routeContext, { session }) => {
  const { collection } = await routeContext.params;
  if (!isValidCollectionName(collection)) {
    return NextResponse.json({ error: "Invalid collection name" }, { status: 400 });
  }

  if (!(await ensureAllowedReader(session))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const data = await readCollection(collection, actorFromSession(session), {
    adminSeesAll: effectiveAdminView(request, session),
  });
  return NextResponse.json(data);
}, { auth: true, rateLimits: ["ip", "user"] });

export const PUT = withApi(async (request, routeContext, { session }) => {
  const { collection } = await routeContext.params;
  if (!isValidCollectionName(collection)) {
    return NextResponse.json({ error: "Invalid collection name" }, { status: 400 });
  }

  if (!(await ensureAllowedReader(session))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const writeSpec = buildRateLimitKey("write", request, session, { collection });
  if (writeSpec) {
    const writeRl = await checkRateLimit(writeSpec.key, writeSpec.limit);
    if (!writeRl.allowed) {
      const response = NextResponse.json({ error: "Too many requests" }, { status: 429 });
      response.headers.set("Retry-After", String(writeRl.retryAfter));
      return response;
    }
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body)) {
    return NextResponse.json({ error: "Body must be an array" }, { status: 400 });
  }

  const actor = actorFromSession(session);
  const users = collection === "goals" ? await listCollectionItems("profile") : [];
  const channels = collection === "messages" ? await listCollectionItems("channels") : [];
  // Authorize against a snapshot taken UNDER the collection lock so a concurrent
  // PUT cannot soft-delete rows the other writer just inserted (lost update).
  let oldCollection;
  let toSave;
  try {
    const result = await replaceCollectionItemsAtomic(collection, session.email, async (lockedOld) => {
      const auth = authorizeCollectionSave(
        collection,
        lockedOld,
        body,
        actor,
        { adminView: effectiveAdminView(request, session), users, channels },
      );
      if (!auth.ok) {
        throw new CollectionSaveError(auth.message, auth.status);
      }
      return Array.isArray(auth.body) ? auth.body : body;
    });
    oldCollection = result.oldItems;
    toSave = result.newItems;
  } catch (err) {
    if (err instanceof CollectionSaveError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
  if (collection === "profile") {
    invalidatePendingApprovalsCache();
  }
  dispatchCollectionNotifications({
    collectionName: collection,
    oldItems: oldCollection,
    newItems: toSave,
    actor: { name: session.name, email: session.email },
  });
  return NextResponse.json({ success: true });
}, { auth: true, rateLimits: ["ip", "user"] });

export const POST = withApi(async (request, routeContext, { session }) => {
  const { collection } = await routeContext.params;
  if (!isValidCollectionName(collection)) {
    return NextResponse.json({ error: "Invalid collection name" }, { status: 400 });
  }

  if (!(await ensureAllowedReader(session))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const writeSpec = buildRateLimitKey("write", request, session, { collection });
  if (writeSpec) {
    const writeRl = await checkRateLimit(writeSpec.key, writeSpec.limit);
    if (!writeRl.allowed) {
      const response = NextResponse.json({ error: "Too many requests" }, { status: 429 });
      response.headers.set("Retry-After", String(writeRl.retryAfter));
      return response;
    }
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const mergeItems = body && typeof body === "object" && body.merge === true && Array.isArray(body.items)
    ? body.items
    : null;
  if (!mergeItems) {
    return NextResponse.json({ error: "Body must be { merge: true, items: [...] }" }, { status: 400 });
  }

  const actor = actorFromSession(session);
  const users = collection === "goals" ? await listCollectionItems("profile") : [];
  const channels = collection === "messages" ? await channelsForMessageItems(mergeItems) : [];
  let oldCollection;
  let toSave;
  try {
    const result = await mergeCollectionItemsAtomic(
      collection,
      mergeItems,
      session.email,
      async (lockedOld, merged) => {
        const auth = authorizeCollectionSave(
          collection,
          lockedOld,
          merged,
          actor,
          { adminView: effectiveAdminView(request, session), users, channels },
        );
        if (!auth.ok) {
          throw new CollectionSaveError(auth.message, auth.status);
        }
        return Array.isArray(auth.body) ? auth.body : merged;
      },
    );
    oldCollection = result.oldItems;
    toSave = result.newItems;
  } catch (err) {
    if (err instanceof CollectionSaveError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
  if (collection === "profile") {
    invalidatePendingApprovalsCache();
  }
  dispatchCollectionNotifications({
    collectionName: collection,
    oldItems: oldCollection,
    newItems: toSave,
    actor: { name: session.name, email: session.email },
  });
  return NextResponse.json({ success: true });
}, { auth: true, rateLimits: ["ip", "user"] });
