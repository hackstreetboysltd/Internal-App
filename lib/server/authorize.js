import {
  emailForStoredOwnerName,
  normalizeEmail,
  normalizePersonName,
} from "@/lib/normalize";
import {
  collectionUsesSecurityLevel,
  DEFAULT_SECURITY_LEVEL,
  normalizeSecurityLevel,
  recordAuthorEmail,
  recordAuthorName,
  SECURITY_LEVEL_A,
  securityLevelOf,
} from "@/lib/securityLevel";
import {
  dmMemberPair,
  isChannelMember,
  isDmChannel,
  mergeChannelSavePayload,
  normalizeDmChannelRecord,
} from "@/lib/channels";
import { finalizeMessageSavePayload } from "@/lib/messageSave";

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

const SECURITY_LEVEL_DENIED =
  "Permission Denied: Unauthorized change to record security level or admin-only records.";

/**
 * @param {{ name?: string, email?: string, roles?: string[] } | null | undefined} actor
 */
export function actorIsAdmin(actor) {
  return Array.isArray(actor?.roles) && actor.roles.includes("admin");
}

/**
 * @param {unknown} item
 * @param {{ name?: string, email?: string, roles?: string[] } | null | undefined} actor
 */
export function actorOwnsRecord(item, actor) {
  const actorEmail = normalizeEmail(actor && actor.email);
  const recordEmail = recordAuthorEmail(item);
  if (actorEmail && recordEmail && actorEmail === recordEmail) return true;
  const actorName = normalizePersonName(actor && actor.name);
  const recordName = recordAuthorName(item);
  return !!(actorName && recordName && actorName === recordName);
}

/**
 * Record A/B ACL disabled — all allowlisted users can read all records.
 * Admin vs user still applies via Admin Mode, channel membership, and owner guards.
 * @param {unknown} item
 * @param {{ name?: string, email?: string, roles?: string[] } | null | undefined} actor
 */
export function actorCanReadRecord(item, actor) {
  return true;
}

/**
 * @param {unknown[]} items
 * @param {{ name?: string, email?: string, roles?: string[] } | null | undefined} actor
 */
export function filterItemsForActor(items, actor) {
  if (!Array.isArray(items)) return [];
  return items.slice();
}

/**
 * Channel visibility for reads:
 * - Members always see channels they belong to (A/B must not hide membership).
 * - Admins see every channel only when `adminSeesAll` is set (Admin Mode / Channels module).
 *
 * @param {unknown[]} items
 * @param {{ name?: string, email?: string, roles?: string[] } | null | undefined} actor
 * @param {{ adminSeesAll?: boolean }} [options]
 */
export function filterChannelItemsForActor(items, actor, options = {}) {
  const list = Array.isArray(items) ? items : [];
  if (options.adminSeesAll === true && actorIsAdmin(actor)) {
    return list.slice();
  }
  return list.filter((ch) => isChannelMember(ch, actor?.email));
}

/**
 * Ensure A-level rows the actor cannot see survive full-array saves (get→mutate→save).
 * Rejects tampering with those rows when they appear in the payload.
 * @param {unknown[]} oldCollection
 * @param {unknown[]} body
 * @param {{ name?: string, email?: string, roles?: string[] } | null | undefined} actor
 */
export function mergeUnreadableItemsForSave(oldCollection, body, actor) {
  if (!Array.isArray(body)) {
    return { ok: false, status: 400, message: "Save payload must be an array", body: [] };
  }
  if (actorIsAdmin(actor)) {
    return { ok: true, body };
  }

  const next = body.map((item) => item);
  const byId = new Map(next.map((item) => [String(item && item.id), item]));

  for (const oldItem of oldCollection) {
    if (!oldItem || typeof oldItem !== "object") continue;
    if (actorCanReadRecord(oldItem, actor)) continue;
    const id = String(oldItem.id);
    const incoming = byId.get(id);
    if (!incoming) {
      next.push(oldItem);
      byId.set(id, oldItem);
      continue;
    }
    if (!safeEquals(incoming, oldItem)) {
      return { ok: false, status: 403, message: SECURITY_LEVEL_DENIED, body: [] };
    }
  }

  return { ok: true, body: next };
}

/**
 * @param {unknown} item
 * @returns {unknown}
 */
function withDefaultSecurityLevel(item) {
  if (!item || typeof item !== "object") return item;
  const row = { ...item };
  if (row.securityLevel == null || row.securityLevel === "") {
    row.securityLevel = DEFAULT_SECURITY_LEVEL;
  } else {
    row.securityLevel = normalizeSecurityLevel(row.securityLevel);
  }
  if (row.data && typeof row.data === "object") {
    const nested = { ...row.data };
    if (nested.securityLevel == null || nested.securityLevel === "") {
      nested.securityLevel = row.securityLevel;
    } else {
      nested.securityLevel = normalizeSecurityLevel(nested.securityLevel);
      row.securityLevel = nested.securityLevel;
    }
    row.data = nested;
  }
  return row;
}

/**
 * @param {string} collectionName
 * @param {unknown[]} oldCollection
 * @param {unknown[]} body
 * @param {{ name?: string, email?: string, roles?: string[] }} actor
 */
function authorizeSecurityLevelChanges(collectionName, oldCollection, body, actor) {
  if (!collectionUsesSecurityLevel(collectionName)) {
    return { ok: true };
  }

  const oldById = new Map(
    (Array.isArray(oldCollection) ? oldCollection : []).map((item) => [
      String(item && item.id),
      item,
    ]),
  );

  for (const newItem of body) {
    if (!newItem || typeof newItem !== "object") continue;
    const id = String(newItem.id);
    const oldItem = oldById.get(id);
    const nextLevel = securityLevelOf(newItem);

    if (!oldItem) {
      // Creates: anyone may choose A or B; defaults applied elsewhere.
      continue;
    }

    const prevLevel = securityLevelOf(oldItem);
    if (prevLevel === nextLevel) continue;

    if (actorIsAdmin(actor)) continue;
    if (!actorOwnsRecord(oldItem, actor)) {
      return { ok: false, status: 403, message: SECURITY_LEVEL_DENIED };
    }
  }

  return { ok: true };
}

/**
 * @param {string} collectionName
 * @param {unknown[]} oldCollection
 * @param {unknown[]} body
 * @param {{ name?: string, email?: string, roles?: string[] }} actor
 * @param {{ adminView?: boolean, users?: unknown[] }} options
 * @returns {{ ok: true, body: unknown[] } | { ok: false, status: number, message: string }}
 */
export function authorizeCollectionSave(collectionName, oldCollection, body, actor, options = {}) {
  if (!Array.isArray(body)) {
    return { ok: false, status: 400, message: "Save payload must be an array" };
  }

  const adminView = options.adminView === true;
  const users = Array.isArray(options.users) ? options.users : [];

  let workingBody = body;
  if (collectionName === "messages") {
    const finalized = finalizeMessageSavePayload(oldCollection, workingBody, actor, {
      channels: Array.isArray(options.channels) ? options.channels : [],
    });
    if (!finalized.ok) {
      return { ok: false, status: finalized.status, message: finalized.message };
    }
    return { ok: true, body: finalized.body };
  }
  if (collectionName === "channels") {
    workingBody = mergeChannelSavePayload(oldCollection, workingBody, actor);
    const channelAuth = authorizeChannelCollectionSave(oldCollection, workingBody, actor);
    if (!channelAuth.ok) return channelAuth;
    return { ok: true, body: channelAuth.body };
  }
  if (collectionName === "profile") {
    return authorizeProfileCollectionSave(oldCollection, workingBody, actor);
  }
  if (collectionUsesSecurityLevel(collectionName)) {
    const merged = mergeUnreadableItemsForSave(oldCollection, body, actor);
    if (!merged.ok) {
      return { ok: false, status: merged.status, message: merged.message };
    }
    workingBody = merged.body.map(withDefaultSecurityLevel);

    const levelAuth = authorizeSecurityLevelChanges(
      collectionName,
      oldCollection,
      workingBody,
      actor,
    );
    if (!levelAuth.ok) {
      return levelAuth;
    }
  }

  if (["skills", "procedures", "goals", "calendar", "meetings", "apps", "documents"].includes(collectionName)) {
    const skipOwnerGuard = adminView && (collectionName === "goals" || collectionName === "apps");

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
        const newItem = workingBody.find((n) => String(n.id) === String(oldItem.id));
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
          } else if (key === "securityLevel") {
            if (securityLevelOf(oldItem) !== securityLevelOf(newItem)) return true;
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

  return { ok: true, body: workingBody };
}

/**
 * Profile rows are keyed by email. Actors may only create/update their own row;
 * msgPub on other rows is immutable.
 *
 * @param {unknown[]} oldCollection
 * @param {unknown[]} body
 * @param {{ name?: string, email?: string, roles?: string[] } | null | undefined} actor
 */
function authorizeProfileCollectionSave(oldCollection, body, actor) {
  const actorEmail = normalizeEmail(actor && actor.email);
  if (!actorEmail) {
    return { ok: false, status: 403, message: DENIED_MESSAGE };
  }
  const oldList = Array.isArray(oldCollection) ? oldCollection : [];
  const nextList = Array.isArray(body) ? body : [];
  const oldByEmail = new Map(
    oldList
      .filter((p) => p && typeof p === "object")
      .map((p) => [normalizeEmail(p.email), p]),
  );
  const out = [];
  const seen = new Set();

  for (const oldItem of oldList) {
    if (!oldItem || typeof oldItem !== "object") continue;
    const key = normalizeEmail(oldItem.email);
    if (!key) continue;
    const incoming = nextList.find((n) => normalizeEmail(n && n.email) === key);
    if (!incoming) {
      // Keep foreign profiles; only the owner may omit/delete own row via full replace.
      if (key !== actorEmail) {
        out.push(oldItem);
        seen.add(key);
      }
      continue;
    }
    if (key !== actorEmail) {
      // Foreign row: pin server truth (ignore client mutations including msgPub).
      out.push(oldItem);
      seen.add(key);
      continue;
    }
    out.push({
      ...oldItem,
      ...incoming,
      email: actorEmail,
      id: incoming.id ?? oldItem.id ?? actorEmail,
    });
    seen.add(key);
  }

  for (const item of nextList) {
    if (!item || typeof item !== "object") continue;
    const key = normalizeEmail(item.email);
    if (!key || seen.has(key)) continue;
    if (key !== actorEmail) {
      return { ok: false, status: 403, message: DENIED_MESSAGE };
    }
    out.push({
      ...item,
      email: actorEmail,
      id: item.id ?? actorEmail,
    });
    seen.add(key);
  }

  return { ok: true, body: out };
}

function authorizeChannelCollectionSave(oldCollection, body, actor) {
  const oldList = Array.isArray(oldCollection) ? oldCollection : [];
  const nextList = Array.isArray(body) ? body : [];
  const oldById = new Map(oldList.map((item) => [String(item && item.id), item]));
  const admin = actorIsAdmin(actor);
  const actorEmail = normalizeEmail(actor && actor.email);
  const out = [];

  for (const oldItem of oldList) {
    if (!oldItem || typeof oldItem !== "object") continue;
    const id = String(oldItem.id);
    const incoming = nextList.find((n) => String(n && n.id) === id);
    if (!incoming) {
      if (admin) continue;
      if (!isChannelMember(oldItem, actorEmail)) continue;
      return {
        ok: false,
        status: 403,
        message: "You cannot delete this channel.",
      };
    }
  }

  for (const item of nextList) {
    if (!item || typeof item !== "object") continue;
    const oldItem = oldById.get(String(item.id));

    if (!oldItem) {
      if (isDmChannel(item)) {
        const normalized = normalizeDmChannelRecord(item, admin ? "" : actorEmail);
        if (!normalized.ok) {
          return { ok: false, status: 403, message: normalized.message };
        }
        out.push(normalized.channel);
        continue;
      }
      if (!admin) {
        return {
          ok: false,
          status: 403,
          message: "Only admins can manage communication channels.",
        };
      }
      const members = Array.isArray(item.memberEmails)
        ? [...new Set(item.memberEmails.map((e) => normalizeEmail(e)).filter(Boolean))]
        : [];
      out.push({ ...item, memberEmails: members, kind: item.kind === "dm" ? "dm" : item.kind });
      continue;
    }

    if (isDmChannel(oldItem) || isDmChannel(item)) {
      const oldPair = dmMemberPair(...(Array.isArray(oldItem.memberEmails) ? oldItem.memberEmails : []));
      const incomingPair = Array.isArray(item.memberEmails)
        ? dmMemberPair(...item.memberEmails)
        : oldPair;
      if (incomingPair.length && JSON.stringify(incomingPair) !== JSON.stringify(oldPair)) {
        return {
          ok: false,
          status: 403,
          message: "A direct thread stays locked to the original pair.",
        };
      }
      const frozen = normalizeDmChannelRecord(
        { ...item, memberEmails: oldPair, id: oldItem.id },
        "",
      );
      if (!frozen.ok) {
        return { ok: false, status: 403, message: frozen.message };
      }
      if (String(frozen.channel.id) !== String(oldItem.id)) {
        return {
          ok: false,
          status: 403,
          message: "A direct thread stays locked to the original pair.",
        };
      }
      if (!admin && !isChannelMember(oldItem, actorEmail)) {
        return { ok: false, status: 403, message: DENIED_MESSAGE };
      }
      out.push({
        ...oldItem,
        updatedAt: item.updatedAt || oldItem.updatedAt,
        kind: "dm",
        id: oldItem.id,
        slug: oldItem.slug || oldItem.id,
        memberEmails: oldPair,
      });
      continue;
    }

    if (!admin) {
      out.push(oldItem);
      continue;
    }

    const members = Array.isArray(item.memberEmails)
      ? [...new Set(item.memberEmails.map((e) => normalizeEmail(e)).filter(Boolean))]
      : [];
    out.push({ ...item, memberEmails: members });
  }

  return { ok: true, body: out };
}

export { safeEquals };
