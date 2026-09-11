import { normalizeEmail } from "@/lib/normalize";
import {
  DIRECT_CHANNEL_ID,
  isChannelMember,
  isDmChannel,
} from "@/lib/channels";

function isSealedWrap(w) {
  return !!(w && (w.type === "ecdh" || w.type === "hybrid"));
}

function wrapFingerprint(w) {
  if (!w || typeof w !== "object") return "";
  return [
    normalizeEmail(w.email),
    String(w.key || ""),
    String(w.kemCt || ""),
    String(w.iv || ""),
    String(w.salt || ""),
  ].join(":");
}

/**
 * Ciphertext fingerprint used to detect a real edit vs a collection re-save.
 * @param {unknown} m
 */
export function messageCipherFingerprint(m) {
  if (!m || typeof m !== "object") return "";
  const wraps = (Array.isArray(m.wrappedKeys) ? m.wrappedKeys : [])
    .map(wrapFingerprint)
    .sort()
    .join("|");
  return `${String(m.cipher || "")}|${String(m.iv || "")}|${String(m.enc || "")}|${wraps}`;
}

/**
 * Server-owned `editedAt`: stamp on ciphertext change, preserve otherwise, never on create.
 *
 * @param {unknown} oldItem
 * @param {object} next
 * @param {string} nowIso
 */
export function applyMessageEditStamp(oldItem, next, nowIso) {
  const stamped = { ...next };
  if (!oldItem || typeof oldItem !== "object") {
    delete stamped.editedAt;
    return stamped;
  }
  const changed = messageCipherFingerprint(oldItem) !== messageCipherFingerprint(next);
  if (changed) {
    stamped.editedAt = nowIso;
  } else if (oldItem.editedAt) {
    stamped.editedAt = oldItem.editedAt;
  } else {
    delete stamped.editedAt;
  }
  return stamped;
}

/**
 * Message ownership is email-only (session email must match record.email).
 *
 * @param {unknown} record
 * @param {{ name?: string, email?: string } | null | undefined} actor
 */
export function actorOwnsMessageRecord(record, actor) {
  if (!record || typeof record !== "object") return false;
  const actorEmail = normalizeEmail(actor && actor.email);
  const recordEmail = normalizeEmail(record.email);
  return !!(actorEmail && recordEmail && actorEmail === recordEmail);
}

function messageRoomId(m) {
  const raw = String(m && m.channel ? m.channel : DIRECT_CHANNEL_ID)
    .trim()
    .toLowerCase();
  return raw || DIRECT_CHANNEL_ID;
}

/**
 * @param {unknown} item
 * @param {{ email?: string } | null | undefined} actor
 * @param {unknown[]} channels
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function actorCanWriteMessageRoom(item, actor, channels) {
  const actorEmail = normalizeEmail(actor && actor.email);
  if (!actorEmail) {
    return { ok: false, message: "Permission Denied: Missing actor email." };
  }
  const room = messageRoomId(item);
  if (room === DIRECT_CHANNEL_ID) {
    return { ok: true };
  }
  const list = Array.isArray(channels) ? channels : [];
  const channel = list.find((ch) => ch && String(ch.id) === room);
  if (channel) {
    if (isChannelMember(channel, actorEmail)) return { ok: true };
    return {
      ok: false,
      message: "Permission Denied: You are not a member of this channel.",
    };
  }
  if (room.startsWith("dm-") || isDmChannel({ id: room, kind: "dm" })) {
    // DM id encodes both members; require actor email token in the id.
    const token = encodeURIComponent(actorEmail).replace(/%/g, "_");
    if (room.includes(token)) return { ok: true };
    return {
      ok: false,
      message: "Permission Denied: You are not a member of this direct thread.",
    };
  }
  return {
    ok: false,
    message: "Permission Denied: Unknown channel.",
  };
}

/**
 * Re-attach omitted foreign rows and missing wraps from the pre-save snapshot.
 *
 * @param {unknown[]} oldCollection
 * @param {unknown[]} incoming
 * @param {{ name?: string, email?: string } | null | undefined} actor
 * @returns {unknown[]}
 */
export function mergeMessageSavePayload(oldCollection, incoming, actor) {
  const actorObj = typeof actor === "string" ? { name: actor } : actor;
  const list = Array.isArray(incoming) ? incoming.filter(Boolean).map((item) => item) : [];
  const byId = new Map(list.map((item) => [String(item && item.id), item]));

  for (const oldItem of Array.isArray(oldCollection) ? oldCollection : []) {
    if (!oldItem || typeof oldItem !== "object") continue;
    const id = String(oldItem.id);
    const incomingItem = byId.get(id);
    const foreign = !actorOwnsMessageRecord(oldItem, actorObj);

    if (!incomingItem) {
      if (foreign) {
        list.push(oldItem);
        byId.set(id, oldItem);
      }
      continue;
    }

    const prevSealed = (Array.isArray(oldItem.wrappedKeys) ? oldItem.wrappedKeys : []).filter(isSealedWrap);
    if (!prevSealed.length) continue;

    const nextWraps = Array.isArray(incomingItem.wrappedKeys) ? incomingItem.wrappedKeys : [];
    const nextSealed = nextWraps.filter(isSealedWrap);
    const to = Array.isArray(incomingItem.to)
      ? incomingItem.to.map((addr) => normalizeEmail(addr)).filter(Boolean)
      : [];
    const complete =
      to.length > 0 &&
      to.every((addr) => nextSealed.some((w) => normalizeEmail(w.email) === addr));
    if (complete) continue;

    const nextEmails = new Set(nextSealed.map((w) => normalizeEmail(w.email)));
    const preserved = prevSealed.filter((w) => !nextEmails.has(normalizeEmail(w.email)));
    if (!preserved.length) continue;

    const merged = { ...incomingItem, wrappedKeys: [...nextWraps, ...preserved] };
    const idx = list.findIndex((row) => String(row && row.id) === id);
    if (idx >= 0) list[idx] = merged;
    byId.set(id, merged);
  }

  return list;
}

/**
 * Messages save contract:
 * - foreign rows are immutable (always the server snapshot)
 * - actor may create / edit / delete only rows they own (email)
 * - creates/edits must target a room the actor can write
 * - omitted foreign rows are restored; omitted own rows stay deleted
 *
 * @param {unknown[]} oldCollection
 * @param {unknown[]} incoming
 * @param {{ name?: string, email?: string } | null | undefined} actor
 * @param {{ channels?: unknown[] }} [options]
 * @returns {{ ok: true, body: unknown[] } | { ok: false, status: number, message: string }}
 */
export function finalizeMessageSavePayload(oldCollection, incoming, actor, options = {}) {
  const oldList = Array.isArray(oldCollection) ? oldCollection : [];
  const oldById = new Map(
    oldList.filter((item) => item && typeof item === "object").map((item) => [String(item.id), item]),
  );
  const channels = Array.isArray(options.channels) ? options.channels : [];
  const sessionEmail = normalizeEmail(actor && actor.email);
  const nowIso = new Date().toISOString();

  const merged = mergeMessageSavePayload(oldList, incoming, actor);
  const out = [];
  const seen = new Set();

  for (const oldItem of oldList) {
    if (!oldItem || typeof oldItem !== "object") continue;
    if (actorOwnsMessageRecord(oldItem, actor)) continue;
    const id = String(oldItem.id);
    out.push(oldItem);
    seen.add(id);
  }

  for (const item of merged) {
    if (!item || typeof item !== "object") continue;
    const id = String(item.id);
    if (seen.has(id)) continue;

    const oldItem = oldById.get(id);
    if (!oldItem) {
      const stamped = applyMessageEditStamp(null, {
        ...item,
        email: sessionEmail || normalizeEmail(item.email) || item.email,
        author: (actor && actor.name) || item.author || item.user || "",
      }, nowIso);
      if (!actorOwnsMessageRecord(stamped, actor)) {
        return {
          ok: false,
          status: 403,
          message: "Permission Denied: Unauthorized modification or deletion of records owned by another user.",
        };
      }
      const roomGate = actorCanWriteMessageRoom(stamped, actor, channels);
      if (!roomGate.ok) {
        return { ok: false, status: 403, message: roomGate.message };
      }
      out.push(stamped);
      seen.add(id);
      continue;
    }

    if (!actorOwnsMessageRecord(oldItem, actor)) {
      continue;
    }

    const next = applyMessageEditStamp(oldItem, {
      ...item,
      email: sessionEmail || normalizeEmail(oldItem.email) || item.email,
      author: oldItem.author || item.author || (actor && actor.name) || "",
    }, nowIso);
    const roomGate = actorCanWriteMessageRoom(next, actor, channels);
    if (!roomGate.ok) {
      return { ok: false, status: 403, message: roomGate.message };
    }
    // Disallow moving a message into a room the actor cannot write (already gated),
    // and keep ownership email stable.
    out.push(next);
    seen.add(id);
  }

  return { ok: true, body: out };
}

/**
 * Client send/edit should POST only changed rows. A full collection PUT rewrites
 * every message under the advisory lock and cannot finish in under a second.
 *
 * @param {unknown[]} oldCollection
 * @param {unknown[]} nextCollection
 * @returns {{ upserts: object[], deletes: string[] }}
 */
export function messageUpsertsAndDeletes(oldCollection, nextCollection) {
  const oldList = Array.isArray(oldCollection) ? oldCollection : [];
  const nextList = Array.isArray(nextCollection) ? nextCollection : [];
  /** @type {Map<string, object>} */
  const oldById = new Map();
  for (const item of oldList) {
    if (!item || typeof item !== "object") continue;
    oldById.set(String(item.id), item);
  }

  /** @type {object[]} */
  const upserts = [];
  const nextIds = new Set();
  for (const item of nextList) {
    if (!item || typeof item !== "object") continue;
    const id = String(item.id);
    nextIds.add(id);
    const prev = oldById.get(id);
    if (!prev || messageCipherFingerprint(prev) !== messageCipherFingerprint(item)) {
      upserts.push(item);
    }
  }

  const deletes = [];
  for (const id of oldById.keys()) {
    if (!nextIds.has(id)) deletes.push(id);
  }
  return { upserts, deletes };
}
