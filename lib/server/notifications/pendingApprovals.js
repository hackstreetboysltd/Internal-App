import {
  goalNeedsAdminReview,
  resolveGoalReviewSubmittedMs,
} from "@/lib/goalReview";
import { emailForStoredOwnerName, normalizeEmail } from "@/lib/normalize";
import { listCollectionItems } from "@/lib/server/collectionsDb";
import { linkPathForCollection } from "@/lib/server/notifications/links";
import { MODULE_BY_COLLECTION, PENDING_BASE } from "@/lib/server/notifications/rulesShared";

const APPROVAL_CACHE_MS = 5_000;

/** @type {{ rows: Array<Record<string, unknown>>, expiresAt: number } | null} */
let approvalCache = null;
/** @type {Promise<Array<Record<string, unknown>>> | null} */
let approvalCacheInFlight = null;

/**
 * @param {unknown} value
 */
function msFromValue(value) {
  if (value == null || value === "") return 0;
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * @param {unknown} id
 */
function msFromId(id) {
  const numeric = Number(id);
  if (Number.isFinite(numeric) && numeric > 1_000_000_000_000) return numeric;
  return 0;
}

/**
 * @param {number} ms
 */
function toIso(ms) {
  return ms > 0 ? new Date(ms).toISOString() : null;
}

/**
 * @param {Record<string, unknown>} record
 * @param {unknown[]} profiles
 */
function ownerEmail(record, profiles) {
  const fromName = emailForStoredOwnerName(record.user || record.author, profiles);
  if (fromName) return fromName;
  const raw = normalizeEmail(record.email);
  return raw.includes("@") ? raw : "";
}

/**
 * @param {string} email
 * @param {string} name
 */
function actorKey(email, name) {
  const normalizedEmail = normalizeEmail(email);
  if (normalizedEmail.includes("@")) return normalizedEmail.toLowerCase();
  return String(name || "unknown").trim().toLowerCase();
}

/**
 * @param {string} value
 */
function capitalize(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * @param {Record<string, unknown>} record
 */
function batchLabelForGoalRecord(record) {
  const type = record.type || (record.weekId ? "weekly" : "annual");
  const period = record.periodId || record.weekId || "";
  return period ? `${capitalize(String(type))} goals · ${period}` : `${capitalize(String(type))} goals`;
}

/**
 * @param {string} text
 */
function plainText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

/**
 * @param {string} collectionName
 * @param {Record<string, unknown>} entry
 */
function titleForPendingEntry(collectionName, entry) {
  const data = entry.data && typeof entry.data === "object" ? entry.data : entry;
  if (collectionName === "skills" || collectionName === "procedures") {
    return plainText(data.title) || "Untitled";
  }
  if (collectionName === "apps") {
    return plainText(data.name) || "App";
  }
  if (collectionName === "goals") {
    if (entry.type === "goals_completed") {
      const period = data.periodId ? ` · ${data.periodId}` : "";
      return `${plainText(data.user || entry.author) || "Team member"}'s goals${period}`;
    }
    const period = data.periodId ? ` · ${data.periodId}` : "";
    return `${data.type || "Goal"} goals${period}`;
  }
  if (collectionName === "calendar" || collectionName === "meetings") {
    const title = plainText(data.title) || "Calendar entry";
    const when = data.date || data.time || "";
    return when ? `${title} · ${when}` : title;
  }
  return "Submission";
}

/**
 * @param {string | undefined} type
 */
function actionLabelForPendingType(type) {
  if (type === "create") return "New submission";
  if (type === "edit") return "Updated submission";
  if (type === "goals_completed") return "Goals batch review";
  return "Awaiting approval";
}

/**
 * @param {Record<string, unknown>} entry
 */
function pendingSubmittedMs(entry) {
  const data = entry.data && typeof entry.data === "object" ? entry.data : {};
  return msFromValue(data.createdAt)
    || msFromId(entry.id)
    || msFromId(data.id)
    || 0;
}

/**
 * Live approval queue for admin — no DB notification rows created.
 * Loads all collections in parallel and memoizes briefly so the bell badge
 * and panel open don't each pay a multi-second remote-DB round-trip stampede.
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export async function listPendingApprovalsForAdmin() {
  const now = Date.now();
  if (approvalCache && now < approvalCache.expiresAt) {
    return approvalCache.rows;
  }
  if (approvalCacheInFlight) {
    return approvalCacheInFlight;
  }

  approvalCacheInFlight = buildPendingApprovalsForAdmin()
    .then((rows) => {
      approvalCache = { rows, expiresAt: Date.now() + APPROVAL_CACHE_MS };
      return rows;
    })
    .finally(() => {
      approvalCacheInFlight = null;
    });

  return approvalCacheInFlight;
}

export function invalidatePendingApprovalsCache() {
  approvalCache = null;
  approvalCacheInFlight = null;
}

/**
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
async function buildPendingApprovalsForAdmin() {
  /** @type {Array<Record<string, unknown>>} */
  const rows = [];

  const pendingEntries = Object.entries(PENDING_BASE).filter(([, baseCol]) => baseCol !== "messages");
  const pendingCols = pendingEntries.map(([pendingCol]) => pendingCol);

  const [profiles, goals, ...pendingLists] = await Promise.all([
    listCollectionItems("profile"),
    listCollectionItems("goals"),
    ...pendingCols.map((col) => listCollectionItems(col)),
  ]);

  for (let i = 0; i < pendingEntries.length; i += 1) {
    const [, baseCol] = pendingEntries[i];
    const items = pendingLists[i] || [];
    const moduleLabel = MODULE_BY_COLLECTION[baseCol] || baseCol;
    const linkPath = linkPathForCollection(baseCol);

    for (const entry of items) {
      if (!entry || typeof entry !== "object") continue;
      const data = entry.data && typeof entry.data === "object" ? entry.data : {};
      const author = String(entry.author || data.user || data.author || "A team member");
      const authorEmail = emailForStoredOwnerName(author, profiles)
        || normalizeEmail(data.email)
        || "";
      const pendingType = String(entry.type || "create");
      const submittedMs = pendingSubmittedMs(entry);

      rows.push({
        id: `pending:${baseCol}:${entry.id}:${pendingType}`,
        kind: "approval",
        module: moduleLabel,
        action: actionLabelForPendingType(pendingType),
        item_name: titleForPendingEntry(baseCol, entry),
        actor_name: author,
        actor_email: authorEmail.includes("@") ? authorEmail : null,
        actor_key: actorKey(authorEmail, author),
        link_path: linkPath,
        mandatory: true,
        read: false,
        created_at: toIso(submittedMs),
        approval_kind: "pending",
      });
    }
  }

  for (const record of goals) {
    if (!record || typeof record !== "object") continue;
    const subGoals = Array.isArray(record.goals) ? record.goals : [];
    const email = ownerEmail(record, profiles);
    const displayName = plainText(record.user) || email || "Team member";

    const reviewIndices = [];
    for (let i = 0; i < subGoals.length; i += 1) {
      if (goalNeedsAdminReview(subGoals[i])) reviewIndices.push(i);
    }
    const isBatch = reviewIndices.length > 1;
    const batchKey = isBatch ? `goals-record:${record.id}` : null;
    const batchLabel = isBatch ? batchLabelForGoalRecord(record) : null;

    for (const i of reviewIndices) {
      const goal = subGoals[i];
      const submittedMs = resolveGoalReviewSubmittedMs(goal, record);
      rows.push({
        id: `goal-review:${record.id}:${i}`,
        kind: "approval",
        module: "Goals",
        action: "Goal completed",
        item_name: plainText(goal.text) || "Untitled goal",
        actor_name: displayName,
        actor_email: email || null,
        actor_key: actorKey(email, displayName),
        link_path: linkPathForCollection("goals"),
        mandatory: true,
        read: false,
        created_at: toIso(submittedMs),
        batch_key: batchKey,
        batch_label: batchLabel,
        approval_kind: "goal_review",
      });
    }
  }

  rows.sort((a, b) => {
    const ta = msFromValue(a.created_at);
    const tb = msFromValue(b.created_at);
    return tb - ta;
  });

  return rows;
}

/**
 * @param {Array<Record<string, unknown>>} rows
 * @param {boolean} unreadOnly
 */
export function filterApprovalRows(rows, unreadOnly) {
  if (!unreadOnly) return rows;
  return rows.filter((row) => !row.read);
}
