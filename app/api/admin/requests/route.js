import { NextResponse } from "next/server";
import { queryApiRequestLogs, readAdminQueryFilters } from "@/lib/server/adminLogs";
import { withApi } from "@/lib/server/withApi";

export const dynamic = "force-dynamic";

export const GET = withApi(async (request) => {
  const filters = readAdminQueryFilters(request);
  const rows = await queryApiRequestLogs(filters);
  return NextResponse.json({ rows, limit: filters.limit, offset: filters.offset });
}, { auth: true, admin: true, rateLimits: ["ip", "user"] });
