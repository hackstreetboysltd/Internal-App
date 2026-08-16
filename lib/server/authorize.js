import {
  emailForStoredOwnerName,
  normalizeEmail,
  normalizePersonName,
} from "@/lib/normalize";

function safeEquals(a, b) {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a == b) {
    if ((typeof a === "string" || typeof a === "number") && (typeof b === "string" || typeof b === "number")) {
      return String(a) === String(b);
    }
  }
  if (typeof a !== typeof b) return false;
  if (a && typeof a === "object" && b && typeof b === "object") {
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (!safeEquals(a[i], b[i])) return false;
      }
      return true;
    }
    if (Array.isArray(a) || Array.isArray(b)) return false;

    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    for (const k of keysA) {
      if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
      if (!safeEquals(a[k], b[k])) return false;
    }
    return true;
  }
  return false;
}

function isDocumentsChangeAuthorized(oldItem, newItem, actorName) {
  const actor = (actorName || "").toLowerCase();
  const recordOwner = (oldItem.author || "").toLowerCase();
  const isRecordOwner = !!(actor && recordOwner && actor === recordOwner);
  const oldDocs = Array.isArray(oldItem.documents) ? oldItem.documents : [];
  const newDocs = Array.isArray(newItem.documents) ? newItem.documents : [];

  for (const od of oldDocs) {
    const nd = newDocs.find((d) => String(d.id) === String(od.id));
    const postedBy = (od.postedBy || "").toLowerCase();
    const ownsDoc = !!(actor && postedBy && actor === postedBy);
    if (!nd) {
      if (!ownsDoc && !isRecordOwner) return false;
      continue;
    }
    if (!safeEquals(od, nd) && !ownsDoc) return false;
  }
  for (const nd of newDocs) {
    const existed = oldDocs.some((d) => String(d.id) === String(nd.id));
    if (existed) continue;
    if ((nd.postedBy || "").toLowerCase() !== actor) return false;
  }
  return true;
}

function resolveGoalRecordEmail(record, users) {
  if (!record) return "";
  const fromStoredName = emailForStoredOwnerName(record.user || record.author, users);
  if (fromStoredName) return fromStoredName;
  return normalizeEmail(record.email);
}

function actorOwnsGoalRecord(record, actor, users) {
  const actorEmail = normalizeEmail(actor && actor.email);
  const recordEmail = resolveGoalRecordEmail(record, users);
  if (actorEmail && recordEmail && actorEmail === recordEmail) return true;
  const ownerKey = normalizePersonName(record && (record.user || record.author));
  const actorName = normalizePersonName(actor && actor.name);
  return !!(ownerKey && actorName && ownerKey === actorName);
}

function actorCanManageGoalRecord(record, actor, users) {
  if (actorOwnsGoalRecord(record, actor, users)) return true;
  const actorEmail = normalizeEmail(actor && actor.email);
  const createdByEmail = normalizeEmail(record && record.createdByEmail);
  if (actorEmail && createdByEmail && actorEmail === createdByEmail) return true;
  const createdBy = normalizePersonName(record && record.createdBy);
  const actorName = normalizePersonName(actor && actor.name);
  return !!(createdBy && actorName && createdBy === actorName);
}

function goalRecordActorCanModify(oldItem, actor, users) {
  return actorCanManageGoalRecord(oldItem, actor, users);
}

const DENIED_MESSAGE =
  "Permission Denied: Unauthorized modification or deletion of records owned by another user.";

/**
 * @param {string} collectionName
 * @param {unknown[]} oldCollection
 * @param {unknown[]} body
 * @param {{ name?: string, email?: string }} actor
 * @param {{ adminView?: boolean, users?: unknown[] }} options
 */
export function authorizeCollectionSave(collectionName, oldCollection, body, actor, options = {}) {
  if (!Array.isArray(body)) {
    return { ok: false, status: 400, message: "Save payload must be an array" };
  }

  const adminView = options.adminView === true;
  const users = Array.isArray(options.users) ? options.users : [];

  if (["skills", "procedures", "goals", "calendar", "meetings", "messages", "apps", "documents"].includes(collectionName)) {
    const skipOwnerGuard = adminView && collectionName === "goals";

    const isUnauthorized = !skipOwnerGuard && oldCollection.some((oldItem) => {
      if (collectionName === "goals") {
        if (goalRecordActorCanModify(oldItem, actor, users)) return false;
        const owner = oldItem.user || oldItem.author;
        if (!owner && !oldItem.createdBy) return false;
      }

      const author = oldItem.author || oldItem.user;
      if (!author) return false;

      const isNotOwner = author.toLowerCase() !== (actor.name || "").toLowerCase();
      if (isNotOwner) {
        const newItem = body.find((n) => String(n.id) === String(oldItem.id));
        if (!newItem) {
          return true;
        }
        const keys = new Set([...Object.keys(oldItem), ...Object.keys(newItem)]);
        for (const key of keys) {
          if (key === "documents") {
            if (!isDocumentsChangeAuthorized(oldItem, newItem, actor.name)) return true;
          } else if (key === "tickets") {
            const oldTickets = oldItem.tickets || [];
            const newTickets = newItem.tickets || [];

            const ticketDeleted = oldTickets.some((ot) => !newTickets.some((nt) => String(nt.id) === String(ot.id)));
            if (ticketDeleted) return true;

            const unauthorizedTicketEdit = oldTickets.some((ot) => {
              const ticketAuthor = ot.author;
              if (!ticketAuthor) return false;
              if (ticketAuthor.toLowerCase() !== (actor.name || "").toLowerCase()) {
                const nt = newTickets.find((x) => String(x.id) === String(ot.id));
                if (!nt || !safeEquals(nt, ot)) {
                  return true;
                }
              }
              return false;
            });
            if (unauthorizedTicketEdit) return true;
          } else if (!safeEquals(oldItem[key], newItem[key])) {
            return true;
          }
        }
      }
      return false;
    });

    if (isUnauthorized) {
      return { ok: false, status: 403, message: DENIED_MESSAGE };
    }
  }

  return { ok: true };
}

export { safeEquals };
