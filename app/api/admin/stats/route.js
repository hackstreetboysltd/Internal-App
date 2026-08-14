import { NextResponse } from "next/server";
import { queryAdminStats } from "@/lib/server/adminLogs";
import { withApi } from "@/lib/server/withApi";

export const dynamic = "force-dynamic";

export const GET = withApi(async () => {
  const stats = await queryAdminStats();
  return NextResponse.json(stats);
}, { auth: true, admin: true, rateLimits: ["ip", "user"] });
