import { NextResponse } from "next/server";
import {
  countUnreadNotifications,
  listNotificationsForReader,
  markNotificationsRead,
  readerIsAdmin,
} from "@/lib/server/notifications/store";
import {
  filterApprovalRows,
  listPendingApprovalsForAdmin,
} from "@/lib/server/notifications/pendingApprovals";
import { isEmailAllowed } from "@/lib/server/whitelist";
import { withApi } from "@/lib/server/withApi";

export const dynamic = "force-dynamic";

export const GET = withApi(async (request, _routeContext, { session }) => {
  if (!session?.email || !(await isEmailAllowed(session.email))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const unreadOnly = url.searchParams.get("unread") === "1";
  const isAdmin = readerIsAdmin(session.roles);

  if (isAdmin) {
    const approvals = await listPendingApprovalsForAdmin();
    const notifications = filterApprovalRows(approvals, unreadOnly);
    return NextResponse.json({
      notifications,
      unreadCount: approvals.length,
      approvalQueue: true,
    });
  }

  const items = await listNotificationsForReader(session.email, isAdmin, 100);
  const unreadCount = await countUnreadNotifications(session.email, isAdmin);
  const notifications = unreadOnly ? items.filter((row) => !row.read) : items;
  return NextResponse.json({ notifications, unreadCount, approvalQueue: false });
}, { auth: true, rateLimits: ["ip", "user"] });

export const POST = withApi(async (request, _routeContext, { session }) => {
  if (!session?.email || !(await isEmailAllowed(session.email))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const isAdmin = readerIsAdmin(session.roles);
  if (isAdmin) {
    const approvals = await listPendingApprovalsForAdmin();
    return NextResponse.json({ success: true, unreadCount: approvals.length });
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const ids = Array.isArray(body.ids) ? body.ids.map(String) : undefined;
  await markNotificationsRead(session.email, isAdmin, ids);
  const unreadCount = await countUnreadNotifications(session.email, isAdmin);
  return NextResponse.json({ success: true, unreadCount });
}, { auth: true, rateLimits: ["ip", "user"] });
