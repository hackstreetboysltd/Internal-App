import { NextResponse } from "next/server";
import { query } from "@/lib/server/db";
import { listSessionsForUid } from "@/lib/server/session";
import { withApi } from "@/lib/server/withApi";

export const dynamic = "force-dynamic";

export const GET = withApi(async (request) => {
  const email = new URL(request.url).searchParams.get("email")?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "email query param is required" }, { status: 400 });
  }

  const userRes = await query(`SELECT id, email, name FROM users WHERE lower(email) = $1`, [email]);
  if (!userRes.rows.length) {
    return NextResponse.json({ rows: [] });
  }

  const user = userRes.rows[0];
  const sessions = await listSessionsForUid(user.id);
  return NextResponse.json({
    rows: sessions.map((s) => ({
      sid: s.sid,
      uid: s.uid,
      email: s.email,
      name: s.name,
      roles: s.roles || [],
      sessionId: s.sessionId || "",
      createdAt: s.createdAt,
      lastSeenAt: s.lastSeenAt,
    })),
  });
}, { auth: true, admin: true, rateLimits: ["ip", "user"] });
