import { NextResponse } from "next/server";
import {
  actorCanReadRecord,
  authorizeCollectionSave,
  filterChannelItemsForActor,
} from "@/lib/server/authorize";
import { assertValidCollectionName } from "@/lib/server/collectionNames";
import {
  getCollectionItem,
  listCollectionItems,
  patchCollectionItem,
  softDeleteCollectionItem,
} from "@/lib/server/collectionsDb";
import { actorOwnsMessageRecord } from "@/lib/messageSave";
import { filterMessageItemsForActor } from "@/lib/channels";
import { redactMessageWrapsForActor } from "@/lib/messageRead";
import { normalizeEmail } from "@/lib/normalize";
import { sanitizeItemForClient } from "@/lib/accountIdentity";
import { collectionUsesSecurityLevel } from "@/lib/securityLevel";
import { effectiveAdminView } from "@/lib/server/adminRole";
import { isEmailAllowed } from "@/lib/server/whitelist";
import { withApi } from "@/lib/server/withApi";

export const dynamic = "force-dynamic";

const DENIED =
  "Permission Denied: Unauthorized modification or deletion of records owned by another user.";

function actorOwnsProfileRecord(record, actor) {
  const actorEmail = normalizeEmail(actor && actor.email);
  const recordEmail = normalizeEmail(record && record.email);
  return !!(actorEmail && recordEmail && actorEmail === recordEmail);
}

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

async function canReadItem(collection, item, actor, options = {}) {
  if (collection === "channels") {
    return filterChannelItemsForActor([item], actor, {
      adminSeesAll: options.adminSeesAll === true,
    }).length > 0;
  }
  if (collection === "messages") {
    const channels = await listCollectionItems("channels");
    return filterMessageItemsForActor([item], actor, channels).length > 0;
  }
  if (collectionUsesSecurityLevel(collection)) {
    return actorCanReadRecord(item, actor);
  }
  return true;
}

export const GET = withApi(async (request, routeContext, { session }) => {
  const { collection, id } = await routeContext.params;
  assertValidCollectionName(collection);

  if (!(await ensureAllowedReader(session))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const item = await getCollectionItem(collection, id);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const actor = actorFromSession(session);
  if (!(await canReadItem(collection, item, actor, {
    adminSeesAll: effectiveAdminView(request, session),
  }))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (collection === "messages") {
    const [redacted] = redactMessageWrapsForActor([item], actor);
    return NextResponse.json(redacted || item);
  }

  return NextResponse.json(sanitizeItemForClient(collection, item));
}, { auth: true, rateLimits: ["ip", "user"] });

export const PATCH = withApi(async (request, routeContext, { session }) => {
  const { collection, id } = await routeContext.params;
  assertValidCollectionName(collection);

  if (!(await ensureAllowedReader(session))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let patch;
  try {
    patch = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const actor = actorFromSession(session);
  const oldCollection = await listCollectionItems(collection);
  const existing = oldCollection.find((item) => String(item.id) === String(id));
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!(await canReadItem(collection, existing, actor))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (collection === "messages" && !actorOwnsMessageRecord(existing, actor)) {
    return NextResponse.json({ error: DENIED }, { status: 403 });
  }
  if (collection === "profile" && !actorOwnsProfileRecord(existing, actor)) {
    return NextResponse.json({ error: DENIED }, { status: 403 });
  }

  const next = { ...existing, ...patch, id: existing.id ?? id };
  const channels =
    collection === "messages" ? await listCollectionItems("channels") : [];
  const merged = oldCollection.map((item) => (String(item.id) === String(id) ? next : item));
  const users = collection === "goals" ? await listCollectionItems("profile") : [];
  const auth = authorizeCollectionSave(
    collection,
    oldCollection,
    merged,
    actor,
    { adminView: effectiveAdminView(request, session), users, channels },
  );

  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const authorizedNext =
    Array.isArray(auth.body) &&
    auth.body.find((item) => String(item && item.id) === String(id));

  // Messages and profile: apply authorized body only — never re-spread raw patch.
  if (collection === "messages" || collection === "profile") {
    if (!authorizedNext || typeof authorizedNext !== "object") {
      return NextResponse.json({ error: DENIED }, { status: 403 });
    }
    const updated = await patchCollectionItem(collection, id, authorizedNext, session.email);
    return NextResponse.json(sanitizeItemForClient(collection, updated));
  }

  const patchToApply =
    authorizedNext && typeof authorizedNext === "object"
      ? {
          ...patch,
          securityLevel: authorizedNext.securityLevel,
          ...(collection === "channels"
            ? { memberEmails: authorizedNext.memberEmails }
            : {}),
        }
      : patch;

  const updated = await patchCollectionItem(collection, id, patchToApply, session.email);
  return NextResponse.json(updated);
}, { auth: true, rateLimits: ["ip", "user", "write"] });

export const DELETE = withApi(async (request, routeContext, { session }) => {
  const { collection, id } = await routeContext.params;
  assertValidCollectionName(collection);

  if (!(await ensureAllowedReader(session))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const actor = actorFromSession(session);
  const oldCollection = await listCollectionItems(collection);
  const existing = oldCollection.find((item) => String(item.id) === String(id));
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!(await canReadItem(collection, existing, actor))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (collection === "messages" && !actorOwnsMessageRecord(existing, actor)) {
    return NextResponse.json({ error: DENIED }, { status: 403 });
  }
  if (collection === "profile" && !actorOwnsProfileRecord(existing, actor)) {
    return NextResponse.json({ error: DENIED }, { status: 403 });
  }

  const merged = oldCollection.filter((item) => String(item.id) !== String(id));
  const channels =
    collection === "messages" ? await listCollectionItems("channels") : [];
  const users = collection === "goals" ? await listCollectionItems("profile") : [];
  const auth = authorizeCollectionSave(
    collection,
    oldCollection,
    merged,
    actor,
    { adminView: effectiveAdminView(request, session), users, channels },
  );

  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  // Foreign message/profile rows restored into auth.body must block delete.
  if (collection === "messages" || collection === "profile") {
    const stillPresent =
      Array.isArray(auth.body) &&
      auth.body.some((item) => String(item && item.id) === String(id));
    if (stillPresent) {
      return NextResponse.json({ error: DENIED }, { status: 403 });
    }
  }

  await softDeleteCollectionItem(collection, id, session.email);
  return NextResponse.json({ success: true });
}, { auth: true, rateLimits: ["ip", "user", "write"] });
