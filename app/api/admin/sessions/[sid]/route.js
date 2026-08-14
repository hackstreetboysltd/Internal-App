import { NextResponse } from "next/server";
import { destroySession, getSession, isValidSid } from "@/lib/server/session";
import { withApi } from "@/lib/server/withApi";

export const dynamic = "force-dynamic";

export const DELETE = withApi(async (_request, routeContext) => {
  const { sid } = await routeContext.params;
  if (!isValidSid(sid)) {
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  }

  const existing = await getSession(sid);
  if (!existing) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  await destroySession(sid);
  return NextResponse.json({
    success: true,
    sid,
    email: existing.email,
  });
}, { auth: true, admin: true, rateLimits: ["ip", "user"] });
