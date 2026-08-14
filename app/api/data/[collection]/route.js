import { NextResponse } from "next/server";
import { authorizeCollectionSave } from "@/lib/server/authorize";
import { assertValidCollectionName } from "@/lib/server/collectionNames";
import {
  listCollectionItems,
  readCollection,
  replaceCollectionItems,
} from "@/lib/server/collectionsDb";
import { buildRateLimitKey, checkRateLimit } from "@/lib/server/rateLimit";
import { isEmailAllowed } from "@/lib/server/whitelist";
import { withApi } from "@/lib/server/withApi";

export const dynamic = "force-dynamic";

function readAdminView(request) {
  const url = new URL(request.url);
  return url.searchParams.get("admin") === "1" || url.searchParams.get("adminView") === "1";
}

/**
 * @param {{ email?: string } | null | undefined} session
 */
async function ensureAllowedReader(session) {
  if (!session?.email) return false;
  return isEmailAllowed(session.email);
}

export const GET = withApi(async (_request, routeContext, { session }) => {
  const { collection } = await routeContext.params;
  assertValidCollectionName(collection);

  if (!(await ensureAllowedReader(session))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const data = await readCollection(collection);
  return NextResponse.json(data);
}, { auth: true, rateLimits: ["ip", "user"] });

export const PUT = withApi(async (request, routeContext, { session }) => {
  const { collection } = await routeContext.params;
  assertValidCollectionName(collection);

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

  const oldCollection = await listCollectionItems(collection);
  const users = collection === "goals" ? await listCollectionItems("profile") : [];
  const auth = authorizeCollectionSave(
    collection,
    oldCollection,
    body,
    { name: session.name, email: session.email },
    { adminView: readAdminView(request), users },
  );

  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  await replaceCollectionItems(collection, body, session.email);
  return NextResponse.json({ success: true });
}, { auth: true, rateLimits: ["ip", "user"] });

export const POST = PUT;
