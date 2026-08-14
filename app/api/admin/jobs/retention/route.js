import { NextResponse } from "next/server";
import { runHardeningJobs } from "@/lib/server/retention";
import { withApi } from "@/lib/server/withApi";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function cronAuthorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") || "";
  return header === `Bearer ${secret}`;
}

async function runRetention() {
  const result = await runHardeningJobs();
  return NextResponse.json({ success: true, ...result });
}

/** Vercel Cron (GET + Authorization: Bearer CRON_SECRET). */
export const GET = withApi(async (request) => {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runRetention();
}, { auth: false, rateLimits: ["ip"] });

export const POST = withApi(async () => {
  const result = await runHardeningJobs();
  return NextResponse.json({ success: true, ...result });
}, { auth: true, admin: true, rateLimits: ["ip", "user"] });
