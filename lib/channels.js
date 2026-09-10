import { normalizeEmail } from "@/lib/normalize";
import { DEFAULT_SECURITY_LEVEL, normalizeSecurityLevel } from "@/lib/securityLevel";

export const DIRECT_CHANNEL_ID = "direct";
export const RESERVED_CHANNEL_IDS = new Set([DIRECT_CHANNEL_ID]);

export const DIRECT_CHANNEL_META = {
  id: DIRECT_CHANNEL_ID,
  label: "Direct",
  hint: "Sealed to selected teammates",
};

/**
 * @param {string} name
 */
export function slugifyChannelName(name) {
  const base = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "channel";
}

/**
 * @param {string} slug
 * @param {unknown[]} existing
 * @param {string | null} [excludeId]
 */
export function uniqueChannelSlug(slug, existing, excludeId = null) {
  const list = Array.isArray(existing) ? existing : [];
  let candidate = slugifyChannelName(slug);
  if (RESERVED_CHANNEL_IDS.has(candidate)) {
    candidate = `${candidate}-channel`;
  }
  let n = 2;
  const taken = (id) =>
    list.some(
      (ch) =>
        ch &&
        String(ch.id) !== String(excludeId || "") &&
        (String(ch.id) === id || String(ch.slug || "") === id),
    );
  let out = candidate;
  while (taken(out)) {
    out = `${candidate}-${n}`;
    n += 1;
  }
  return out;
}

/**
 * @param {unknown} channel
 * @param {string | null | undefined} email
 */
export function isChannelMember(channel, email) {
  const key = normalizeEmail(email);
  if (!key || !channel || typeof channel !== "object") return false;
  const members = Array.isArray(channel.memberEmails) ? channel.memberEmails : [];
  return members.some((m) => normalizeEmail(m) === key);
}

/**
 * @param {unknown[]} channels
 * @param {{ email?: string, roles?: string[] } | null | undefined} actor
 * @param {{ adminSeesAll?: boolean }} [options]
 */
export function filterChannelsForActor(channels, actor, options = {}) {
  const list = Array.isArray(channels) ? channels : [];
  const isAdmin = Array.isArray(actor?.roles) && actor.roles.includes("admin");
  if (options.adminSeesAll === true && isAdmin) return list.slice();
  return list.filter((ch) => isChannelMember(ch, actor?.email));
}

/**
 * Tabs for Messages: membership-filtered channels (groups + DMs).
 * @param {unknown[]} channels
 */
export function messageChannelTabs(channels) {
  return (Array.isArray(channels) ? channels : []).map((ch) => ({
    id: String(ch.id),
    label: String(ch.name || ch.slug || ch.id),
    hint: String(ch.description || "").trim() || (isDmChannel(ch) ? "Direct" : "Channel"),
    kind: isDmChannel(ch) ? "dm" : "group",
  }));
}

/**
 * @param {unknown} channel
 */
export function normalizeChannelRecord(channel) {
  if (!channel || typeof channel !== "object") return null;
  const id = String(channel.id || "").trim().toLowerCase();
  if (!id || RESERVED_CHANNEL_IDS.has(id)) return null;
  const memberEmails = Array.isArray(channel.memberEmails)
    ? [...new Set(channel.memberEmails.map((e) => normalizeEmail(e)).filter(Boolean))]
    : [];
  return {
    ...channel,
    id,
    slug: String(channel.slug || id).trim().toLowerCase() || id,
    name: String(channel.name || id).trim() || id,
    description: String(channel.description || "").trim(),
    memberEmails,
    securityLevel: normalizeSecurityLevel(channel.securityLevel || DEFAULT_SECURITY_LEVEL),
    kind: isDmChannel(channel) ? "dm" : channel.kind,
  };
}

export function isDmChannel(channel) {
  if (!channel || typeof channel !== "object") return false;
  if (String(channel.kind || "").toLowerCase() === "dm") return true;
  return String(channel.id || "").toLowerCase().startsWith("dm-");
}

function emailToken(email) {
  return encodeURIComponent(normalizeEmail(email)).replace(/%/g, "_");
}

/**
 * Canonical id for a 1:1 sealed thread. Same pair always maps to the same id.
 * @param {string} emailA
 * @param {string} emailB
 */
export function dmChannelId(emailA, emailB) {
  const a = normalizeEmail(emailA);
  const b = normalizeEmail(emailB);
  if (!a || !b || a === b) return "";
  const [x, y] = a < b ? [a, b] : [b, a];
  return `dm-${emailToken(x)}--${emailToken(y)}`;
}

export function dmMemberPair(...emails) {
  const uniq = [...new Set(emails.map((e) => normalizeEmail(e)).filter(Boolean))];
  if (uniq.length !== 2) return [];
  return uniq[0] < uniq[1] ? uniq : [uniq[1], uniq[0]];
}

export function findDmChannel(channels, emailA, emailB) {
  const id = dmChannelId(emailA, emailB);
  const pair = dmMemberPair(emailA, emailB);
  if (!id || pair.length !== 2) return null;
  const list = Array.isArray(channels) ? channels : [];
  return (
    list.find((ch) => String(ch?.id) === id)
    || list.find((ch) => {
      if (!isDmChannel(ch)) return false;
      const members = dmMemberPair(...(Array.isArray(ch.memberEmails) ? ch.memberEmails : []));
      return members.length === 2 && members[0] === pair[0] && members[1] === pair[1];
    })
    || null
  );
}

export function otherDmMember(channel, actorEmail) {
  const me = normalizeEmail(actorEmail);
  const members = (Array.isArray(channel?.memberEmails) ? channel.memberEmails : [])
    .map((e) => normalizeEmail(e))
    .filter(Boolean);
  return members.find((e) => e && e !== me) || "";
}

export function messageRoomId(record) {
  const key = String(record?.channel || DIRECT_CHANNEL_ID).trim().toLowerCase();
  return key || DIRECT_CHANNEL_ID;
}

/**
 * Ciphertext is stored in one collection. Hide rooms the actor is not in.
 * Legacy `direct` rows stay visible only to author or addressed wraps.
 * @param {unknown[]} items
 * @param {{ email?: string } | null | undefined} actor
 * @param {unknown[]} channels
 */
export function filterMessageItemsForActor(items, actor, channels) {
  const list = Array.isArray(items) ? items : [];
  const email = normalizeEmail(actor?.email);
  if (!email) return [];
  const byId = new Map(
    (Array.isArray(channels) ? channels : []).map((ch) => [String(ch?.id), ch]),
  );
  return list.filter((m) => {
    if (!m || typeof m !== "object") return false;
    const room = messageRoomId(m);
    if (room === DIRECT_CHANNEL_ID) {
      if (normalizeEmail(m.email) === email) return true;
      const to = Array.isArray(m.to) ? m.to : [];
      if (to.some((addr) => normalizeEmail(addr) === email)) return true;
      const wraps = Array.isArray(m.wrappedKeys) ? m.wrappedKeys : [];
      return wraps.some((w) => normalizeEmail(w?.email) === email);
    }
    const channel = byId.get(room);
    if (channel) return isChannelMember(channel, email);
    const wraps = Array.isArray(m.wrappedKeys) ? m.wrappedKeys : [];
    return wraps.some((w) => normalizeEmail(w?.email) === email) || normalizeEmail(m.email) === email;
  });
}

/**
 * Membership-filtered GET must not wipe rooms the actor cannot see.
 * @param {unknown[]} oldCollection
 * @param {unknown[]} incoming
 * @param {{ email?: string } | null | undefined} actor
 */
export function mergeChannelSavePayload(oldCollection, incoming, actor) {
  const list = Array.isArray(incoming) ? incoming.filter(Boolean).map((item) => item) : [];
  const byId = new Map(list.map((item) => [String(item && item.id), item]));
  const email = normalizeEmail(actor?.email);
  for (const oldItem of Array.isArray(oldCollection) ? oldCollection : []) {
    if (!oldItem || typeof oldItem !== "object") continue;
    const id = String(oldItem.id);
    if (byId.has(id)) continue;
    if (email && isChannelMember(oldItem, email)) continue;
    list.push(oldItem);
    byId.set(id, oldItem);
  }
  return list;
}

/**
 * @param {unknown} channel
 * @param {string} [actorEmail]
 */
export function normalizeDmChannelRecord(channel, actorEmail) {
  const pair = dmMemberPair(...(Array.isArray(channel?.memberEmails) ? channel.memberEmails : []));
  const actor = normalizeEmail(actorEmail);
  if (pair.length !== 2) return { ok: false, message: "A direct thread is locked to two people." };
  if (actor && !pair.includes(actor)) {
    return { ok: false, message: "You can only open a direct thread you belong to." };
  }
  const id = dmChannelId(pair[0], pair[1]);
  return {
    ok: true,
    channel: {
      ...channel,
      id,
      slug: id,
      kind: "dm",
      name: String(channel?.name || "Direct").trim() || "Direct",
      memberEmails: pair,
      description: String(channel?.description || "Sealed 1:1").trim() || "Sealed 1:1",
    },
  };
}
