import { NextResponse } from "next/server";
import { sendApprovalEmailToUser } from "@/lib/server/notifications/email";
import { isEmailAllowed } from "@/lib/server/whitelist";
import { withApi } from "@/lib/server/withApi";

export const dynamic = "force-dynamic";

export const POST = withApi(async (request, _routeContext, { session }) => {
  if (!session?.email || !(await isEmailAllowed(session.email))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = String(body.email || "").trim().toLowerCase();
  const name = String(body.name || "").trim();
  if (!email.includes("@")) {
    return NextResponse.json({ error: "Valid email required" }, { status: 422 });
  }

  await sendApprovalEmailToUser(email, name);
  return NextResponse.json({ success: true });
}, { auth: true, admin: true, rateLimits: ["ip", "user"] });
