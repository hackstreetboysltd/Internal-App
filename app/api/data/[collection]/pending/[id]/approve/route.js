import { NextResponse } from "next/server";
import { assertValidCollectionName } from "@/lib/server/collectionNames";
import { effectiveAdminView } from "@/lib/server/adminRole";
import {
  approvePendingRecord,
  rejectPendingRecord,
} from "@/lib/server/pendingApproval";
import { isEmailAllowed } from "@/lib/server/whitelist";
import { withApi } from "@/lib/server/withApi";

export const dynamic = "force-dynamic";

/**
 * @param {import('next/server').NextRequest} request
 * @param {{ params: Promise<{ collection: string, id: string }> }} routeContext
 * @param {{ session: { name?: string, email?: string } }} ctx
 * @param {"approve"|"reject"} action
 */
async function handlePendingAction(request, routeContext, { session }, action) {
  if (!session?.email || !(await isEmailAllowed(session.email))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!effectiveAdminView(request, session)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { collection, id } = await routeContext.params;
  assertValidCollectionName(collection);

  try {
    const actor = { name: session.name, email: session.email };
    const result = action === "approve"
      ? await approvePendingRecord(collection, id, actor)
      : await rejectPendingRecord(collection, id, actor);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Pending action failed";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export const POST = withApi(
  (request, routeContext, ctx) => handlePendingAction(request, routeContext, ctx, "approve"),
  { auth: true, rateLimits: ["ip", "user"] },
);
