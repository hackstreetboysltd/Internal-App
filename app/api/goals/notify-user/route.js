import { NextResponse } from "next/server";
import { GOAL_REVIEW_NOT_DONE, resolveGoalReviewStatus } from "@/lib/goalReview";
import { emailForStoredOwnerName, normalizeEmail } from "@/lib/normalize";
import { listCollectionItems } from "@/lib/server/collectionsDb";
import { sendGoalReminderEmail } from "@/lib/server/notifications/email";
import { linkPathForCollection } from "@/lib/server/notifications/links";
import { insertNotification } from "@/lib/server/notifications/store";
import { isEmailAllowed } from "@/lib/server/whitelist";
import { withApi } from "@/lib/server/withApi";

export const dynamic = "force-dynamic";

const MAX_MESSAGE_LENGTH = 2000;

/**
 * @param {unknown} text
 */
function plainGoalText(text) {
  return String(text || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * @param {Record<string, unknown>} record
 * @param {unknown[]} profiles
 */
function resolveOwnerEmail(record, profiles) {
  const fromName = emailForStoredOwnerName(record.user || record.author, profiles);
  if (fromName) return fromName.toLowerCase();
  const raw = normalizeEmail(record.email);
  return raw.includes("@") ? raw.toLowerCase() : "";
}

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

  const recordId = body.recordId;
  const goalIndex = Number(body.goalIndex);
  const message = String(body.message || "").trim().slice(0, MAX_MESSAGE_LENGTH);

  if (recordId == null || recordId === "") {
    return NextResponse.json({ error: "recordId is required" }, { status: 422 });
  }
  if (!Number.isInteger(goalIndex) || goalIndex < 0) {
    return NextResponse.json({ error: "Valid goalIndex is required" }, { status: 422 });
  }

  const [goals, profiles] = await Promise.all([
    listCollectionItems("goals"),
    listCollectionItems("profile"),
  ]);

  const record = goals.find((row) => String(row.id) === String(recordId));
  if (!record) {
    return NextResponse.json({ error: "Goal record not found" }, { status: 404 });
  }

  const subGoals = Array.isArray(record.goals) ? record.goals : [];
  if (goalIndex >= subGoals.length) {
    return NextResponse.json({ error: "Goal not found on record" }, { status: 404 });
  }

  const goal = subGoals[goalIndex];
  if (resolveGoalReviewStatus(goal) !== GOAL_REVIEW_NOT_DONE) {
    return NextResponse.json({ error: "Only incomplete goals can be reminded" }, { status: 422 });
  }

  const targetEmail = resolveOwnerEmail(record, profiles);
  if (!targetEmail) {
    return NextResponse.json({ error: "No email found for goal assignee" }, { status: 422 });
  }

  const goalText = plainGoalText(goal.text) || "Untitled goal";
  const actorName = String(session.name || "Administrator").trim() || "Administrator";
  const snippet = goalText.slice(0, 100);

  await insertNotification({
    kind: "direct",
    module: "Goals",
    action: "sent you a reminder about",
    itemName: `"${snippet}"`,
    actorName,
    actorEmail: session.email,
    targetEmail,
    linkPath: linkPathForCollection("goals"),
    mandatory: true,
  });

  await sendGoalReminderEmail({
    toEmail: targetEmail,
    actorName,
    goalText,
    customMessage: message,
  });

  return NextResponse.json({ success: true });
}, { auth: true, admin: true, rateLimits: ["ip", "user", "write"] });
