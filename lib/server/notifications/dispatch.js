import { listCollectionItems } from "@/lib/server/collectionsDb";
import {
  sendAdminEmail,
  sendAssigneeGoalEmail,
  sendDirectEmail,
} from "@/lib/server/notifications/email";
import { buildCollectionIntents } from "@/lib/server/notifications/rules";
import { linkPathForModule } from "@/lib/server/notifications/links";
import { insertNotification } from "@/lib/server/notifications/store";

const NOTIFY_COLLECTIONS = new Set([
  "skills",
  "procedures",
  "apps",
  "messages",
  "documents",
  "goals",
  "calendar",
  "meetings",
  "pending_skills",
  "pending_procedures",
  "pending_apps",
  "pending_messages",
  "pending_calendar",
  "pending_meetings",
  "pending_goals",
]);

/**
 * Fire-and-forget notification dispatch after a successful collection save.
 * @param {{
 *   collectionName: string,
 *   oldItems: unknown[],
 *   newItems: unknown[],
 *   actor: { name?: string, email?: string },
 * }} params
 */
export function dispatchCollectionNotifications(params) {
  const { collectionName, oldItems, newItems, actor } = params;
  if (!NOTIFY_COLLECTIONS.has(collectionName)) return;

  void processCollectionNotifications({
    collectionName,
    oldItems,
    newItems,
    actor,
  }).catch((err) => {
    console.warn("[Notifications] Dispatch failed:", err);
  });
}

/**
 * @param {{
 *   collectionName: string,
 *   oldItems: unknown[],
 *   newItems: unknown[],
 *   actor: { name?: string, email?: string },
 * }} params
 */
export async function processCollectionNotifications(params) {
  const { collectionName, oldItems, newItems, actor } = params;
  const actorName = String(actor.name || "A Team Member");
  const actorEmail = String(actor.email || "").trim().toLowerCase();

  const profiles = collectionName === "goals" || collectionName === "pending_goals"
    ? await listCollectionItems("profile")
    : [];

  const intents = buildCollectionIntents(collectionName, oldItems, newItems, { profiles });
  if (!intents.length) return;

  for (const intent of intents) {
    const linkPath = intent.linkPath || linkPathForModule(intent.module);

    if (intent.kind === "team") {
      continue;
    }

    if (intent.kind === "admin") {
      await insertNotification({
        kind: "admin",
        module: intent.module,
        action: intent.action,
        itemName: intent.itemName,
        actorName,
        actorEmail,
        linkPath,
        mandatory: true,
      });
      await sendAdminEmail({
        action: intent.action,
        actorName,
        itemName: intent.itemName,
        module: intent.module,
        excludeEmail: actorEmail,
      });
      continue;
    }

    if (intent.kind === "assignee") {
      const targetEmail = String(intent.assigneeEmail || "").trim().toLowerCase();
      await insertNotification({
        kind: "assignee",
        module: intent.module,
        action: intent.action,
        itemName: intent.itemName,
        actorName,
        actorEmail,
        targetEmail,
        linkPath,
        mandatory: true,
      });
      await sendAssigneeGoalEmail({
        assigneeName: intent.assigneeName,
        assigneeEmail: intent.assigneeEmail,
        actorName,
        goalType: intent.goalType,
        periodId: intent.periodId,
        action: intent.assigneeAction || "assigned",
        goalItems: intent.goalItems || [],
      });
      continue;
    }

    if (intent.kind === "direct") {
      const targetEmail = String(intent.targetEmail || "").trim().toLowerCase();
      if (!targetEmail) continue;
      await insertNotification({
        kind: "direct",
        module: intent.module,
        action: intent.action,
        itemName: intent.itemName,
        actorName,
        actorEmail,
        targetEmail,
        linkPath,
        mandatory: intent.mandatory === true,
      });
      await sendDirectEmail({
        toEmail: targetEmail,
        actorName,
        action: intent.action,
        itemName: intent.itemName,
        module: intent.module,
        mandatory: intent.mandatory === true,
      });
    }
  }
}
