import { NextResponse } from "next/server";
import { logActivityEvents, normalizeActivityBatch } from "@/lib/server/activityLogger";
import { buildRateLimitKey, checkRateLimit } from "@/lib/server/rateLimit";
import { getClientIp } from "@/lib/server/requestMeta";
import { isEmailAllowed } from "@/lib/server/whitelist";
import { withApi } from "@/lib/server/withApi";

export const dynamic = "force-dynamic";

export const POST = withApi(async (request, _ctx, { session }) => {
  if (!session?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await isEmailAllowed(session.email))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const activitySpec = buildRateLimitKey("activity", request, session);
  if (activitySpec) {
    const activityRl = await checkRateLimit(activitySpec.key, activitySpec.limit);
    if (!activityRl.allowed) {
      const response = NextResponse.json({ error: "Too many requests" }, { status: 429 });
      response.headers.set("Retry-After", String(activityRl.retryAfter));
      return response;
    }
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let events;
  try {
    events = normalizeActivityBatch(body?.events);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid events";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const ip = getClientIp(request);
  const sessionId = session.sessionId || body?.tabSessionId || null;

  await logActivityEvents(
    events.map((event) => ({
      uid: session.uid ? String(session.uid) : null,
      email: session.email,
      sessionId: typeof sessionId === "string" ? sessionId : null,
      eventType: event.eventType,
      path: event.path,
      meta: event.meta,
      ip,
    })),
  );

  return NextResponse.json({ success: true, count: events.length });
}, { auth: true, rateLimits: ["ip", "user"] });
