import { NextResponse } from "next/server";
import { clearSessionCookie, readSessionCookie } from "@/lib/server/cookies";
import { destroySession } from "@/lib/server/session";
import { withApi } from "@/lib/server/withApi";

export const dynamic = "force-dynamic";

async function handler(request) {
  const sid = readSessionCookie(request);
  if (sid) {
    await destroySession(sid);
  }

  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}

export const POST = withApi(handler, { auth: false, rateLimits: ["ip"] });
