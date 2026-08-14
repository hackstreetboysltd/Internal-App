'use client';

const CACHE_KEY_PREFIX = "portal:v1";

/** @typedef {{ cursor: string | null, items: unknown[], fetchedAt: string }} CacheEntry */

/**
 * @param {string | null | undefined} uid
 * @param {string} collection
 */
function storageKey(uid, collection) {
  const userId = uid || "anonymous";
  return `${CACHE_KEY_PREFIX}:${userId}:${collection}`;
}

/**
 * @param {string} key
 * @returns {CacheEntry | null}
 */
function readKey(key) {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.items)) return null;
    return {
      cursor: parsed.cursor ?? null,
      items: parsed.items,
      fetchedAt: parsed.fetchedAt || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/**
 * @param {string} key
 * @param {CacheEntry} entry
 */
function writeKey(key, entry) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(entry));
  } catch (err) {
    console.warn("Cache write failed:", err);
  }
}

export const cacheManager = {
  /**
   * @param {string} collection
   * @param {string | null | undefined} uid
   * @returns {CacheEntry | null}
   */
  read(collection, uid) {
    return readKey(storageKey(uid, collection));
  },

  /**
   * @param {string} collection
   * @param {string | null | undefined} uid
   * @param {unknown[]} items
   * @param {string | null} [cursor]
   */
  write(collection, uid, items, cursor = null) {
    writeKey(storageKey(uid, collection), {
      cursor,
      items: Array.isArray(items) ? items : [],
      fetchedAt: new Date().toISOString(),
    });
  },

  /**
   * @param {string} collection
   * @param {string | null | undefined} uid
   * @param {{ cursor?: string, upserts?: { id: string, data: unknown }[], deletes?: string[] }} delta
   * @returns {unknown[]}
   */
  merge(collection, uid, delta) {
    const existing = readKey(storageKey(uid, collection));
    const byId = new Map();

    for (const item of existing?.items || []) {
      if (item && typeof item === "object" && item.id != null) {
        byId.set(String(item.id), item);
      }
    }

    for (const upsert of delta.upserts || []) {
      if (upsert?.id != null) {
        byId.set(String(upsert.id), upsert.data);
      }
    }

    for (const id of delta.deletes || []) {
      byId.delete(String(id));
    }

    const items = Array.from(byId.values());
    writeKey(storageKey(uid, collection), {
      cursor: delta.cursor ?? existing?.cursor ?? null,
      items,
      fetchedAt: new Date().toISOString(),
    });

    return items;
  },

  /**
   * @param {string} collection
   * @param {string | null | undefined} uid
   */
  clearCollection(collection, uid) {
    if (typeof window === "undefined") return;
    try {
      localStorage.removeItem(storageKey(uid, collection));
    } catch {
      /* ignore */
    }
  },

  /**
   * Clear all portal cache entries, optionally scoped to one user.
   * @param {string | null | undefined} [uid]
   */
  clearAll(uid) {
    if (typeof window === "undefined") return;
    try {
      const prefix = uid ? `${CACHE_KEY_PREFIX}:${uid}:` : `${CACHE_KEY_PREFIX}:`;
      const toRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) {
          toRemove.push(key);
        }
      }
      toRemove.forEach((key) => localStorage.removeItem(key));
    } catch {
      /* ignore */
    }
  },
};
