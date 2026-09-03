import {
  emailForStoredOwnerName,
  normalizeEmail,
} from "@/lib/normalize";
import {
  diffGoalReviewTransitions,
  isGoalsProgressOnlyChange,
} from "@/lib/goalReview";
import {
  diffCollection,
  diffNestedDocuments,
  diffPendingEntries,
  isDocumentsOnlyChange,
} from "@/lib/server/notifications/diff";

/** @typedef {{
 *   kind: "team" | "assignee" | "admin" | "direct",
 *   module: string,
 *   action: string,
 *   itemName: string,
 *   mandatory?: boolean,
 *   targetEmail?: string,
 *   assigneeName?: string,
 *   assigneeEmail?: string,
 *   goalType?: string,
 *   periodId?: string,
 *   assigneeAction?: "assigned" | "updated",
 *   linkPath?: string | null,
 * }} NotificationIntent */

import { MODULE_BY_COLLECTION, PENDING_BASE } from "@/lib/server/notifications/rulesShared";
import { linkPathForCollection } from "@/lib/server/notifications/links";

/**
 * @param {Record<string, unknown> | undefined} record
 * @param {unknown[]} profiles
 */
function goalEmail(record, profiles) {
  if (!record) return "";
  const fromName = emailForStoredOwnerName(record.user || record.author, profiles);
  if (fromName) return fromName;
  return normalizeEmail(record.email);
}

/**
 * @param {Record<string, unknown> | undefined} record
 */
function resolveGoalType(record) {
  if (!record) return "goal";
  if (record.type) return String(record.type);
  if (record.weekId) return "weekly";
  return "goal";
}

/**
 * @param {Record<string, unknown>} item
 */
function skillLabel(item) {
  return String(item.title || "a skill");
}

/**
 * @param {Record<string, unknown>} item
 */
function procedureLabel(item) {
  return String(item.title || "a procedure");
}

/**
 * @param {Record<string, unknown>} item
 */
function appLabel(item) {
  return String(item.name || "an app");
}

/**
 * @param {Record<string, unknown>} item
 */
function documentLabel(item) {
  if (item.name) return String(item.name);
  if (item.title) return String(item.title);
  return "a document";
}

/**
 * @param {Record<string, unknown>} item
 */
function calendarEventLabel(item) {
  const title = item.title || "event";
  const date = item.date || "";
  return date ? `${title} (${date})` : String(title);
}

/**
 * @param {Record<string, unknown>} item
 */
function meetingLabel(item) {
  if (!item.time) return "a meeting";
  const when = new Date(String(item.time)).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `meeting on ${when}`;
}

/**
 * @param {Record<string, unknown>} item
 * @param {"calendar"|"meetings"} collectionName
 */
function recordTitle(item, collectionName) {
  return collectionName === "meetings" ? meetingLabel(item) : calendarEventLabel(item);
}

/**
 * @param {string} collectionName
 * @param {Record<string, unknown>} item
 */
function defaultItemLabel(collectionName, item) {
  switch (collectionName) {
    case "skills":
      return skillLabel(item);
    case "procedures":
      return procedureLabel(item);
    case "apps":
      return appLabel(item);
    case "messages":
      return "an encrypted message";
    case "documents":
      return documentLabel(item);
    case "calendar":
      return calendarEventLabel(item);
    case "meetings":
      return meetingLabel(item);
    default:
      return "an entry";
  }
}

/**
 * @param {string} collectionName
 * @param {{ created: Record<string, unknown>[], updated: { old: Record<string, unknown>, new: Record<string, unknown> }[], deleted: Record<string, unknown>[] }} diff
 * @param {unknown[]} profiles
 * @returns {NotificationIntent[]}
 */
function buildGoalsIntents(collectionName, diff, profiles) {
  /** @type {NotificationIntent[]} */
  const intents = [];
  const moduleLabel = "Goals";

  for (const item of diff.created) {
    const type = resolveGoalType(item);
    const periodId = item.periodId ? String(item.periodId) : "";
    intents.push({
      kind: "team",
      module: moduleLabel,
      action: "added",
      itemName: `${type} goals (${periodId})`,
    });
    if (item.assignedByAdmin) {
      intents.push({
        kind: "assignee",
        module: moduleLabel,
        action: "assigned",
        itemName: `${type} goals (${periodId})`,
        mandatory: true,
        assigneeName: String(item.user || ""),
        assigneeEmail: goalEmail(item, profiles),
        goalType: type,
        periodId,
        assigneeAction: "assigned",
      });
    }
  }

  for (const { old, new: next } of diff.updated) {
    const type = resolveGoalType(next);
    const periodId = next.periodId ? String(next.periodId) : "";
    const ownerEmail = goalEmail(next, profiles);
    const ownerLabel = ownerEmail || String(next.user || "A team member");
    const { submitted, reviewed } = diffGoalReviewTransitions(old, next);

    for (const entry of submitted) {
      const snippet = String(entry.goal.text || "a goal").trim().slice(0, 100);
      intents.push({
        kind: "admin",
        module: moduleLabel,
        action: "marked a goal complete for review",
        itemName: `${ownerLabel}: "${snippet}"`,
        linkPath: linkPathForCollection("goals"),
      });
    }

    for (const entry of reviewed) {
      const snippet = String(entry.goal.text || "your goal").trim().slice(0, 100);
      if (!ownerEmail) continue;
      intents.push({
        kind: "direct",
        module: moduleLabel,
        action: "reviewed your completed goal",
        itemName: `"${snippet}"`,
        targetEmail: ownerEmail,
        linkPath: linkPathForCollection("goals"),
      });
    }

    if (isGoalsProgressOnlyChange(old, next)) {
      continue;
    }

    intents.push({
      kind: "team",
      module: moduleLabel,
      action: "updated",
      itemName: `${type} goals (${periodId})`,
    });

    const wasAssigned = !!old.assignedByAdmin;
    const previousEmail = goalEmail(old, profiles);
    const targetEmail = goalEmail(next, profiles);
    const isAssigned = !!next.assignedByAdmin;
    if (isAssigned && (!wasAssigned || previousEmail !== targetEmail)) {
      intents.push({
        kind: "assignee",
        module: moduleLabel,
        action: wasAssigned ? "updated" : "assigned",
        itemName: `${type} goals (${periodId})`,
        mandatory: true,
        assigneeName: String(next.user || ""),
        assigneeEmail: targetEmail,
        goalType: type,
        periodId,
        assigneeAction: wasAssigned ? "updated" : "assigned",
      });
    }
  }

  for (const item of diff.deleted) {
    const period = item.periodId ? String(item.periodId) : "";
    intents.push({
      kind: "team",
      module: moduleLabel,
      action: "deleted",
      itemName: item.user
        ? `${item.user}'s goals (${period})`
        : "a goals record",
    });
  }

  return intents;
}

/**
 * @param {string} collectionName
 * @param {{ created: Record<string, unknown>[], updated: { old: Record<string, unknown>, new: Record<string, unknown> }[], deleted: Record<string, unknown>[] }} diff
 * @returns {NotificationIntent[]}
 */
function buildDocumentsIntents(collectionName, diff) {
  /** @type {NotificationIntent[]} */
  const intents = [];
  const moduleLabel = "Documents";

  for (const item of diff.created) {
    intents.push({
      kind: "team",
      module: moduleLabel,
      action: "added",
      itemName: documentLabel(item),
    });
  }

  for (const { old, new: next } of diff.updated) {
    const oldDocs = Array.isArray(old.documents) ? old.documents : [];
    const newDocs = Array.isArray(next.documents) ? next.documents : [];
    const looksLikeGroup = Array.isArray(next.documents) && (next.name || old.name);

    if (looksLikeGroup && newDocs.length > oldDocs.length) {
      intents.push({
        kind: "team",
        module: moduleLabel,
        action: oldDocs.length === 0 ? "added" : "updated",
        itemName: String(next.name || old.name || "a group"),
      });
    } else if (!valuesEqualExceptDocuments(old, next)) {
      intents.push({
        kind: "team",
        module: moduleLabel,
        action: "updated",
        itemName: documentLabel(next),
      });
    }
  }

  for (const item of diff.deleted) {
    const isGroup = Array.isArray(item.documents);
    intents.push({
      kind: "team",
      module: moduleLabel,
      action: "deleted",
      itemName: isGroup ? String(item.name || "a group") : documentLabel(item),
    });
  }

  return intents;
}

/**
 * @param {Record<string, unknown>} oldItem
 * @param {Record<string, unknown>} newItem
 */
function valuesEqualExceptDocuments(oldItem, newItem) {
  const keys = new Set([...Object.keys(oldItem || {}), ...Object.keys(newItem || {})]);
  for (const key of keys) {
    if (key === "documents") continue;
    const a = oldItem?.[key];
    const b = newItem?.[key];
    if (JSON.stringify(a) !== JSON.stringify(b)) return false;
  }
  return JSON.stringify(oldItem?.documents) === JSON.stringify(newItem?.documents);
}

/**
 * @param {string} collectionName
 * @param {{ created: Record<string, unknown>[], updated: { old: Record<string, unknown>, new: Record<string, unknown> }[], deleted: Record<string, unknown>[] }} diff
 * @returns {NotificationIntent[]}
 */
function buildCalendarIntents(collectionName, diff) {
  /** @type {NotificationIntent[]} */
  const intents = [];
  const moduleLabel = "Calendar";

  for (const item of diff.created) {
    intents.push({
      kind: "team",
      module: moduleLabel,
      action: "added",
      itemName: defaultItemLabel(collectionName, item),
    });
  }

  for (const { old, new: next } of diff.updated) {
    if (isDocumentsOnlyChange(old, next)) {
      const addedDocs = diffNestedDocuments(old, next);
      for (const doc of addedDocs) {
        intents.push({
          kind: "team",
          module: moduleLabel,
          action: "added",
          itemName: `document "${doc.name || "attachment"}" on ${recordTitle(next, collectionName)}`,
        });
      }
      continue;
    }
    intents.push({
      kind: "team",
      module: moduleLabel,
      action: "edited",
      itemName: defaultItemLabel(collectionName, next),
    });
  }

  for (const item of diff.deleted) {
    intents.push({
      kind: "team",
      module: moduleLabel,
      action: "deleted",
      itemName: defaultItemLabel(collectionName, item),
    });
  }

  return intents;
}

/**
 * @param {string} collectionName
 * @param {{ created: Record<string, unknown>[], updated: { old: Record<string, unknown>, new: Record<string, unknown> }[], deleted: Record<string, unknown>[] }} diff
 * @param {unknown[]} profiles
 * @returns {NotificationIntent[]}
 */
function buildDefaultIntents(collectionName, diff, profiles) {
  if (collectionName === "goals") return buildGoalsIntents(collectionName, diff, profiles);
  if (collectionName === "documents") return buildDocumentsIntents(collectionName, diff);
  if (collectionName === "calendar" || collectionName === "meetings") {
    return buildCalendarIntents(collectionName, diff);
  }

  /** @type {NotificationIntent[]} */
  const intents = [];
  const moduleLabel = MODULE_BY_COLLECTION[collectionName] || collectionName;

  for (const item of diff.created) {
    intents.push({
      kind: "team",
      module: moduleLabel,
      action: "added",
      itemName: defaultItemLabel(collectionName, item),
    });
  }
  const updateAction = collectionName === "goals" ? "updated" : "edited";
  for (const { new: next } of diff.updated) {
    intents.push({
      kind: "team",
      module: moduleLabel,
      action: updateAction,
      itemName: defaultItemLabel(collectionName, next),
    });
  }
  for (const item of diff.deleted) {
    intents.push({
      kind: "team",
      module: moduleLabel,
      action: "deleted",
      itemName: defaultItemLabel(collectionName, item),
    });
  }

  return intents;
}

/**
 * @param {string} pendingCollection
 * @param {unknown[]} oldPending
 * @param {unknown[]} newPending
 * @returns {NotificationIntent[]}
 */
export function buildPendingIntents(pendingCollection, oldPending, newPending) {
  const base = PENDING_BASE[pendingCollection];
  if (!base) return [];

  const moduleLabel = MODULE_BY_COLLECTION[base] || base;
  const added = diffPendingEntries(oldPending, newPending);
  /** @type {NotificationIntent[]} */
  const intents = [];

  for (const entry of added) {
    if (entry.type === "goals_completed") {
      const data = entry.data && typeof entry.data === "object" ? entry.data : {};
      const author = String(entry.author || data.user || "A team member");
      const periodId = data.periodId ? String(data.periodId) : "";
      intents.push({
        kind: "admin",
        module: moduleLabel,
        action: "submitted a goals review",
        itemName: periodId ? `${author}'s goals (${periodId})` : `${author}'s goals`,
        linkPath: linkPathForCollection(base),
      });
      continue;
    }

    if (entry.type !== "create" && entry.type !== "edit") continue;
    const data = entry.data && typeof entry.data === "object" ? entry.data : entry;
    const verb = entry.type === "create" ? "submitted" : "updated submission for";
    intents.push({
      kind: "admin",
      module: moduleLabel,
      action: verb,
      itemName: defaultItemLabel(base, data),
      linkPath: linkPathForCollection(base),
    });
  }

  return intents;
}

/**
 * @param {string} collectionName
 * @param {unknown[]} oldItems
 * @param {unknown[]} newItems
 * @param {{ profiles?: unknown[] }} [ctx]
 * @returns {NotificationIntent[]}
 */
export function buildCollectionIntents(collectionName, oldItems, newItems, ctx = {}) {
  if (collectionName.startsWith("pending_")) {
    return buildPendingIntents(collectionName, oldItems, newItems);
  }

  if (!MODULE_BY_COLLECTION[collectionName]) return [];

  const diff = diffCollection(oldItems, newItems);
  const profiles = Array.isArray(ctx.profiles) ? ctx.profiles : [];

  if (
    diff.created.length === 0
    && diff.updated.length === 0
    && diff.deleted.length === 0
  ) {
    return [];
  }

  return buildDefaultIntents(collectionName, diff, profiles);
}
