import {
  listCollectionItems,
  replaceCollectionItems,
} from "@/lib/server/collectionsDb";
import { assertValidCollectionName } from "@/lib/server/collectionNames";
import { emailForStoredOwnerName } from "@/lib/normalize";
import { linkPathForCollection } from "@/lib/server/notifications/links";
import { sendDirectEmail } from "@/lib/server/notifications/email";
import { dispatchCollectionNotifications } from "@/lib/server/notifications/dispatch";
import { invalidatePendingApprovalsCache } from "@/lib/server/notifications/pendingApprovals";
import { insertNotification } from "@/lib/server/notifications/store";
import { MODULE_BY_COLLECTION } from "@/lib/server/notifications/rulesShared";

const APPROVAL_COLLECTIONS = new Set([
  "skills",
  "procedures",
  "apps",
  "calendar",
  "meetings",
  "goals",
]);

/**
 * @param {Record<string, unknown>} pendingRecord
 * @param {unknown[]} profiles
 */
function submitterEmail(pendingRecord, profiles) {
  const author = String(pendingRecord.author || "").trim();
  if (author) {
    const fromName = emailForStoredOwnerName(author, profiles);
    if (fromName) return fromName.toLowerCase();
  }
  const data = pendingRecord.data && typeof pendingRecord.data === "object"
    ? pendingRecord.data
    : {};
  const fromData = emailForStoredOwnerName(data.author || data.user, profiles);
  if (fromData) return fromData.toLowerCase();
  const raw = String(data.email || "").trim().toLowerCase();
  return raw.includes("@") ? raw : "";
}

/**
 * @param {Record<string, unknown>} pendingRecord
 * @param {string} collectionName
 */
function pendingItemLabel(pendingRecord, collectionName) {
  const data = pendingRecord.data && typeof pendingRecord.data === "object"
    ? pendingRecord.data
    : {};
  if (data.title) return String(data.title);
  if (data.name) return String(data.name);
  if (collectionName === "goals" && data.periodId) {
    return `${data.type || "goal"} goals (${data.periodId})`;
  }
  return "your submission";
}

/**
 * @param {{
 *   collectionName: string,
 *   pendingRecord: Record<string, unknown>,
 *   action: "approved" | "rejected",
 *   actor: { name?: string, email?: string },
 * }} params
 */
async function notifySubmitter(params) {
  const { collectionName, pendingRecord, action, actor } = params;
  const profiles = await listCollectionItems("profile");
  const targetEmail = submitterEmail(pendingRecord, profiles);
  if (!targetEmail) return;

  const moduleLabel = MODULE_BY_COLLECTION[collectionName] || collectionName;
  const itemName = pendingItemLabel(pendingRecord, collectionName);
  const linkPath = linkPathForCollection(collectionName);
  const actorName = String(actor.name || "Administrator");

  await insertNotification({
    kind: "direct",
    module: moduleLabel,
    action,
    itemName,
    actorName,
    actorEmail: String(actor.email || "").trim().toLowerCase() || null,
    targetEmail,
    linkPath,
    mandatory: true,
  });

  await sendDirectEmail({
    toEmail: targetEmail,
    actorName,
    action: action === "approved" ? "approved your submission" : "rejected your submission",
    itemName,
    module: moduleLabel,
    mandatory: true,
  });
}

/**
 * @param {string} collectionName
 * @param {string | number} id
 * @param {{ name?: string, email?: string }} actor
 */
export async function approvePendingRecord(collectionName, id, actor) {
  assertValidCollectionName(collectionName);
  if (!APPROVAL_COLLECTIONS.has(collectionName)) {
    throw new Error(`Collection does not support approvals: ${collectionName}`);
  }

  const pendingCol = `pending_${collectionName}`;
  const pending = await listCollectionItems(pendingCol);
  const recordIdx = pending.findIndex((row) => String(row.id) === String(id));
  if (recordIdx === -1) {
    throw new Error("Record not found in pending queue");
  }

  const record = pending[recordIdx];
  const oldMain = await listCollectionItems(collectionName);
  const main = oldMain.slice();

  if (record.type === "create") {
    main.push(record.data);
  } else if (record.type === "edit") {
    const data = record.data;
    const mainIdx = main.findIndex((row) => String(row.id) === String(data.id));
    if (mainIdx !== -1) main[mainIdx] = data;
    else main.push(data);
  } else if (record.type === "goals_completed") {
    const data = record.data && typeof record.data === "object" ? record.data : {};
    const mainIdx = main.findIndex((row) => String(row.id) === String(data.id));
    if (mainIdx !== -1) {
      const existing = main[mainIdx];
      const goals = Array.isArray(existing.goals) ? existing.goals.map((goal) => ({
        ...goal,
        reviewStatus: goal.done ? "reviewed" : (goal.reviewStatus || "not_done"),
      })) : [];
      main[mainIdx] = { ...existing, goals };
    }
  } else {
    throw new Error(`Unsupported pending record type: ${record.type}`);
  }

  await replaceCollectionItems(collectionName, main, actor.email || null, oldMain);
  dispatchCollectionNotifications({
    collectionName,
    oldItems: oldMain,
    newItems: main,
    actor,
  });

  const nextPending = pending.filter((_, idx) => idx !== recordIdx);
  await replaceCollectionItems(pendingCol, nextPending, actor.email || null, pending);

  await notifySubmitter({
    collectionName,
    pendingRecord: record,
    action: "approved",
    actor,
  });

  invalidatePendingApprovalsCache();
  return { success: true };
}

/**
 * @param {string} collectionName
 * @param {string | number} id
 * @param {{ name?: string, email?: string }} actor
 */
export async function rejectPendingRecord(collectionName, id, actor) {
  assertValidCollectionName(collectionName);
  if (!APPROVAL_COLLECTIONS.has(collectionName)) {
    throw new Error(`Collection does not support approvals: ${collectionName}`);
  }

  const pendingCol = `pending_${collectionName}`;
  const pending = await listCollectionItems(pendingCol);
  const recordIdx = pending.findIndex((row) => String(row.id) === String(id));
  if (recordIdx === -1) {
    throw new Error("Record not found in pending queue");
  }

  const record = pending[recordIdx];
  const nextPending = pending.filter((_, idx) => idx !== recordIdx);
  await replaceCollectionItems(pendingCol, nextPending, actor.email || null, pending);

  await notifySubmitter({
    collectionName,
    pendingRecord: record,
    action: "rejected",
    actor,
  });

  invalidatePendingApprovalsCache();
  return { success: true };
}
