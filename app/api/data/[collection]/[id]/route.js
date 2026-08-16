import { NextResponse } from "next/server";
import { authorizeCollectionSave } from "@/lib/server/authorize";
import { assertValidCollectionName } from "@/lib/server/collectionNames";
import {
  getCollectionItem,
  listCollectionItems,
  patchCollectionItem,
  softDeleteCollectionItem,
} from "@/lib/server/collectionsDb";
import { effectiveAdminView } from "@/lib/server/adminRole";
import { isEmailAllowed } from "@/lib/server/whitelist";
import { withApi } from "@/lib/server/withApi";

export const dynamic = "force-dynamic";

async function ensureAllowedReader(session) {
  if (!session?.email) return false;
  return isEmailAllowed(session.email);
}

export const GET = withApi(async (_request, routeContext, { session }) => {
  const { collection, id } = await routeContext.params;
  assertValidCollectionName(collection);

  if (!(await ensureAllowedReader(session))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const item = await getCollectionItem(collection, id);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(item);
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

  const oldCollection = await listCollectionItems(collection);
  const existing = oldCollection.find((item) => String(item.id) === String(id));
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const next = { ...existing, ...patch, id: existing.id ?? id };
  const merged = oldCollection.map((item) => (String(item.id) === String(id) ? next : item));
  const users = collection === "goals" ? await listCollectionItems("profile") : [];
  const auth = authorizeCollectionSave(
    collection,
    oldCollection,
    merged,
    { name: session.name, email: session.email },
    { adminView: effectiveAdminView(request, session), users },
  );

  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const updated = await patchCollectionItem(collection, id, patch, session.email);
  return NextResponse.json(updated);
}, { auth: true, rateLimits: ["ip", "user", "write"] });

export const DELETE = withApi(async (request, routeContext, { session }) => {
  const { collection, id } = await routeContext.params;
  assertValidCollectionName(collection);

  if (!(await ensureAllowedReader(session))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const oldCollection = await listCollectionItems(collection);
  const existing = oldCollection.find((item) => String(item.id) === String(id));
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const merged = oldCollection.filter((item) => String(item.id) !== String(id));
  const users = collection === "goals" ? await listCollectionItems("profile") : [];
  const auth = authorizeCollectionSave(
    collection,
    oldCollection,
    merged,
    { name: session.name, email: session.email },
    { adminView: effectiveAdminView(request, session), users },
  );

  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  await softDeleteCollectionItem(collection, id, session.email);
  return NextResponse.json({ success: true });
}, { auth: true, rateLimits: ["ip", "user", "write"] });
