import { NextResponse } from "next/server";
import { portalTimeZone, realNowIso, realTimeSource, syncRealTime } from "@/lib/server/realTime";
import { withApi } from "@/lib/server/withApi";

export const dynamic = "force-dynamic";

export const GET = withApi(async () => {
  await syncRealTime();
  return NextResponse.json({
    now: realNowIso(),
    timeZone: portalTimeZone(),
    source: realTimeSource(),
  });
}, { auth: true, rateLimits: ["ip", "user"] });
