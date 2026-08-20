import { NextResponse } from "next/server";
import { isEmailAllowed } from "@/lib/server/whitelist";
import { withApi } from "@/lib/server/withApi";
import { hydrateAllDocumentFilesToDisk } from "@/lib/server/documentFiles";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Warm local disk cache from Postgres blobs (no-op on serverless / when already cached). */
export const POST = withApi(async (_request, _routeContext, { session }) => {
  if (!session?.email || !(await isEmailAllowed(session.email))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const result = await hydrateAllDocumentFilesToDisk();
  return NextResponse.json({ success: true, ...result });
}, { auth: true, rateLimits: ["ip", "user"] });
