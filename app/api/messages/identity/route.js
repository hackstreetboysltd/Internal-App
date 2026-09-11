import { NextResponse } from "next/server";
import { isPersistedIdentity } from "@/lib/accountIdentity";
import { CollectionSaveError } from "@/lib/server/collectionsDb";
import { readOwnerMessageIdentity, writeOwnerMessageIdentity } from "@/lib/server/messageIdentityStore";
import { buildRateLimitKey, checkRateLimit } from "@/lib/server/rateLimit";
import { isEmailAllowed } from "@/lib/server/whitelist";
import { withApi } from "@/lib/server/withApi";

export const dynamic = "force-dynamic";

export const GET = withApi(async (_request, _ctx, { session }) => {
  if (!(await isEmailAllowed(session?.email))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const identity = await readOwnerMessageIdentity(session.email);
  return NextResponse.json({ identity: identity || null });
}, { auth: true, rateLimits: ["ip", "user"] });

export const PUT = withApi(async (request, _ctx, { session }) => {
  if (!(await isEmailAllowed(session?.email))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const writeSpec = buildRateLimitKey("write", request, session, { collection: "profile" });
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

  const identity = body && typeof body === "object" ? body.identity : null;
  if (!isPersistedIdentity(identity)) {
    return NextResponse.json({ error: "Invalid identity" }, { status: 400 });
  }

  try {
    const result = await writeOwnerMessageIdentity(session.email, identity, {
      replace: body.replace === true,
    });
    if (result.conflict) {
      return NextResponse.json(
        { error: "exists", identity: result.identity || null },
        { status: 409 },
      );
    }
    return NextResponse.json({ identity: result.identity });
  } catch (err) {
    if (err instanceof CollectionSaveError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}, { auth: true, rateLimits: ["ip", "user"] });
