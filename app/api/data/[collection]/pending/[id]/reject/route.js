import { NextResponse } from "next/server";
import { assertValidCollectionName } from "@/lib/server/collectionNames";
import { effectiveAdminView } from "@/lib/server/adminRole";
import { rejectPendingRecord } from "@/lib/server/pendingApproval";
import { isEmailAllowed } from "@/lib/server/whitelist";
import { withApi } from "@/lib/server/withApi";

export const dynamic = "force-dynamic";

export const POST = withApi(async (request, routeContext, { session }) => {
  if (!session?.email || !(await isEmailAllowed(session.email))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!effectiveAdminView(request, session)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { collection, id } = await routeContext.params;
  assertValidCollectionName(collection);

  try {
    const result = await rejectPendingRecord(collection, id, {
      name: session.name,
      email: session.email,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Reject failed";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}, { auth: true, rateLimits: ["ip", "user"] });
