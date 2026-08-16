'use client';

const CACHE_KEY_PREFIX = "portal:v1";
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** @typedef {{ cursor: string | null, items: unknown[], fetchedAt: string }} CacheEntry */

/** @type {Map<string, Set<(items: unknown[]) => void>>} */
const listeners = new Map();

/**
 * @param {string | null | undefined} uid
 * @param {string} collection
 */
function storageKey(uid, collection) {
  const userId = uid || "anonymous";
  return `${CACHE_KEY_PREFIX}:${userId}:${collection}`;
}

function notify(collection, items) {
  const set = listeners.get(collection);
  if (!set) return;
  for (const cb of set) {
    try {
      cb(items);
    } catch (err) {
      console.warn("Cache subscriber failed:", err);
    }
  }
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

function listPortalKeys() {
  if (typeof window === "undefined") return [];
  const keys = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(`${CACHE_KEY_PREFIX}:`)) keys.push(key);
    }
  } catch {
    /* ignore */
  }
  return keys;
}

function evictOldest() {
  const scored = listPortalKeys().map((key) => {
    const entry = readKey(key);
    return { key, at: entry?.fetchedAt ? Date.parse(entry.fetchedAt) : 0 };
  });
  scored.sort((a, b) => a.at - b.at);
  const victim = scored[0];
  if (!victim) return false;
  try {
    localStorage.removeItem(victim.key);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} key
 * @param {CacheEntry} entry
 */
function writeKey(key, entry) {
  if (typeof window === "undefined") return;
  const payload = JSON.stringify(entry);
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      localStorage.setItem(key, payload);
      return;
    } catch (err) {
      const quota = err && (err.name === "QuotaExceededError" || err.code === 22);
      if (!quota) {
        console.warn("Cache write failed:", err);
        return;
      }
      if (!evictOldest()) {
        console.warn("Cache write failed: storage full");
        return;
      }
    }
  }
}

export const cacheManager = {
  maxAgeMs: CACHE_MAX_AGE_MS,

  /**
   * @param {CacheEntry | null} entry
   */
  isStale(entry) {
    if (!entry?.fetchedAt) return true;
    const at = Date.parse(entry.fetchedAt);
    if (!Number.isFinite(at)) return true;
    return Date.now() - at > CACHE_MAX_AGE_MS;
  },

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
    const nextItems = Array.isArray(items) ? items : [];
    writeKey(storageKey(uid, collection), {
      cursor,
      items: nextItems,
      fetchedAt: new Date().toISOString(),
    });
    notify(collection, nextItems);
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
    notify(collection, items);
    return items;
  },

  /**
   * @param {string} collection
   * @param {(items: unknown[]) => void} callback
   */
  subscribe(collection, callback) {
    let set = listeners.get(collection);
    if (!set) {
      set = new Set();
      listeners.set(collection, set);
    }
    set.add(callback);
    return () => {
      set.delete(callback);
      if (set.size === 0) listeners.delete(collection);
    };
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
    notify(collection, []);
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
        const k = localStorage.key(i);
        if (k && k.startsWith(prefix)) {
          toRemove.push(k);
        }
      }
      toRemove.forEach((k) => localStorage.removeItem(k));
    } catch {
      /* ignore */
    }
  },
};

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (!event.key || !event.key.startsWith(`${CACHE_KEY_PREFIX}:`)) return;
    const parts = event.key.split(":");
    if (parts.length < 4) return;
    const collection = parts.slice(3).join(":");
    if (!event.newValue) {
      notify(collection, []);
      return;
    }
    try {
      const parsed = JSON.parse(event.newValue);
      notify(collection, Array.isArray(parsed.items) ? parsed.items : []);
    } catch {
      /* ignore malformed cache */
    }
  });
}
