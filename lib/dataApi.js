'use client';

import { apiFetchPath, apiPath } from "@/lib/apiPath";
import { cacheManager } from "@/lib/cacheManager";
import { DATA_PUT_TIMEOUT_MS, httpErrorDetail, isAbortLikeError } from "@/lib/httpErrorDetail";
import { loadSessionUser, refreshAuthSession, waitForSessionReady } from "@/lib/session";

export class DataApiError extends Error {
  constructor(message, status, extra = {}) {
    super(message);
    this.name = "DataApiError";
    this.status = status;
    Object.assign(this, extra);
  }
}

/**
 * @param {Response} res
 */
async function readErrorDetail(res) {
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* ignore non-JSON error pages (Vercel 504 HTML, empty Firefox HTTP/2) */
  }
  return httpErrorDetail(res.status, res.statusText, body);
}

/** @type {Map<string, Promise<unknown[]>>} */
const inflight = new Map();

/** @type {Map<string, number>} */
const syncGeneration = new Map();

/** Collections whose visible set can change without row updated_at (ACL / membership). */
const FULL_RECONCILE_COLLECTIONS = new Set(["channels", "messages"]);

/**
 * PUT bodies for these collections are actor-filtered (and wrap-redacted for messages).
 * Seeding the sync cache from that payload briefly drops peer rows / foreign wraps and
 * looks like messages "appearing then vanishing" when watch repaints.
 */
const PUT_BODY_IS_PARTIAL = new Set(["messages", "channels"]);

function currentUid() {
  const user = loadSessionUser();
  return user?.uid || null;
}

function inflightKey(collectionName, uid, admin) {
  return `${uid || "anon"}:${collectionName}:${admin ? "a" : "u"}`;
}

function generationOf(collectionName, uid) {
  return syncGeneration.get(inflightKey(collectionName, uid, false)) || 0;
}

/** Invalidate in-flight hydrates so a just-written cache is not overwritten by a stale delta. */
function bumpSyncGeneration(collectionName, uid) {
  const key = inflightKey(collectionName, uid, false);
  const next = generationOf(collectionName, uid) + 1;
  syncGeneration.set(key, next);
  inflight.delete(key);
  return next;
}

export async function apiFetch(url, init = {}) {
  const gate = await waitForSessionReady();
  if (!gate.hasSession) {
    throw new DataApiError("Unauthorized", 401);
  }

  const doFetch = () => fetch(url, {
    credentials: "include",
    cache: "no-store",
    ...init,
  });

  let res = await doFetch();
  if (res.status === 401) {
    const user = await refreshAuthSession();
    if (!user) {
      throw new DataApiError("Unauthorized", 401);
    }
    res = await doFetch();
  }
  return res;
}

/**
 * @param {string} collectionName
 * @param {string | null} [since]
 */
export async function syncCollection(collectionName, since = null) {
  const url = new URL(apiPath(`/api/sync/${encodeURIComponent(collectionName)}`), window.location.origin);
  if (since) {
    url.searchParams.set("since", since);
  }

  const res = await apiFetch(url.toString());

  if (!res.ok) {
    throw new DataApiError(await readErrorDetail(res), res.status);
  }

  return res.json();
}

/**
 * @param {string} collectionName
 */
async function fetchCollectionFull(collectionName, options = {}) {
  const res = await apiFetch(apiFetchPath(`/api/data/${encodeURIComponent(collectionName)}`, options));

  if (!res.ok) {
    throw new DataApiError(await readErrorDetail(res), res.status);
  }

  return res.json();
}

function rethrowAuth(err) {
  if (err instanceof DataApiError && (err.status === 401 || err.status === 403)) {
    throw err;
  }
}

function readCachedItems(collectionName, uid) {
  const cached = cacheManager.read(collectionName, uid);
  return Array.isArray(cached?.items) ? cached.items : [];
}

async function hydrateFromNetwork(collectionName, uid, cached) {
  const gen = generationOf(collectionName, uid);
  const applyDelta = (delta) => {
    if (generationOf(collectionName, uid) !== gen) {
      return readCachedItems(collectionName, uid);
    }
    return cacheManager.merge(collectionName, uid, delta);
  };
  const applyFull = (data) => {
    if (generationOf(collectionName, uid) !== gen) {
      return readCachedItems(collectionName, uid);
    }
    if (Array.isArray(data)) {
      cacheManager.write(collectionName, uid, data, new Date().toISOString());
    }
    return data;
  };
  const applyVisibilityFull = (delta) => {
    if (generationOf(collectionName, uid) !== gen) {
      return readCachedItems(collectionName, uid);
    }
    // Replace — delta merge would keep rows that are no longer visible to this actor.
    const items = (delta?.upserts || []).map((row) => row.data).filter(Boolean);
    cacheManager.write(collectionName, uid, items, delta?.cursor || new Date().toISOString());
    return items;
  };

  const needsVisibilityReconcile = FULL_RECONCILE_COLLECTIONS.has(collectionName);
  const stale = cacheManager.isStale(cached);
  const cursorMs = cached?.cursor ? Date.parse(cached.cursor) : NaN;
  const cursorInFuture = Number.isFinite(cursorMs) && cursorMs > Date.now() + 2000;

  // Channels/messages: always full-sync. Membership/wrap visibility can change
  // without a usable cursor, and a future `since` makes every delta empty
  // (HAR 2026-09-10: since=21:33:21.806Z vs rows at 18:43:02Z).
  if (needsVisibilityReconcile || cursorInFuture) {
    try {
      const delta = await syncCollection(collectionName);
      return applyVisibilityFull(delta);
    } catch (err) {
      rethrowAuth(err);
      console.warn(`Sync failed for ${collectionName}, falling back to full fetch:`, err);
      const data = await fetchCollectionFull(collectionName);
      return applyFull(data);
    }
  }

  if (cached?.items?.length && cached.cursor && !stale) {
    const delta = await syncCollection(collectionName, cached.cursor);
    return applyDelta(delta);
  }

  try {
    const delta = await syncCollection(collectionName);
    return applyDelta(delta);
  } catch (err) {
    rethrowAuth(err);
    console.warn(`Sync failed for ${collectionName}, falling back to full fetch:`, err);
    const data = await fetchCollectionFull(collectionName);
    return applyFull(data);
  }
}

function coalesce(key, task) {
  const existing = inflight.get(key);
  if (existing) return existing;
  const pending = task().finally(() => inflight.delete(key));
  inflight.set(key, pending);
  return pending;
}

/**
 * @param {string} collectionName
 * @param {{ admin?: boolean, bypassCache?: boolean, cacheFirst?: boolean }} [options]
 */
export async function fetchCollection(collectionName, options = {}) {
  const uid = currentUid();
  const wantCache = options.cached === true;
  // Only an explicit bypass skips the warm sync cache. (`admin: true` used to imply
  // bypass and forced every admin module through a cold ~2s /api/data round-trip.)
  const bypassCache = options.bypassCache === true && !wantCache;
  const adminAll = options.admin === true;
  const cacheFirst = (options.cacheFirst === true || wantCache) && !bypassCache && !adminAll;
  const cached = bypassCache || adminAll ? null : cacheManager.read(collectionName, uid);

  // Admin Mode lists (channels management, pending merges) must not reuse the
  // membership-filtered sync cache — fetch ?admin=1 and skip writing back.
  if (adminAll) {
    const key = inflightKey(collectionName, uid, true);
    return coalesce(key, async () => {
      const data = await fetchCollectionFull(collectionName, { admin: true });
      return Array.isArray(data) ? data : [];
    });
  }

  if (wantCache && cached && Array.isArray(cached.items)) {
    return cached.items;
  }

  if (cacheFirst && cached?.items?.length) {
    const key = inflightKey(collectionName, uid, false);
    coalesce(key, async () => {
      try {
        return await hydrateFromNetwork(collectionName, uid, cached);
      } catch (err) {
        rethrowAuth(err);
        console.warn(`Background sync failed for ${collectionName}, keeping cache:`, err);
        return cached.items;
      }
    }).catch(() => {});
    return cached.items;
  }

  if (!bypassCache && cached?.items?.length) {
    const key = inflightKey(collectionName, uid, false);
    try {
      return await coalesce(key, () => hydrateFromNetwork(collectionName, uid, cached));
    } catch (err) {
      rethrowAuth(err);
      console.warn(`Sync failed for ${collectionName}, trying full fetch...`, err);
      try {
        const gen = generationOf(collectionName, uid);
        const data = await fetchCollectionFull(collectionName, options);
        if (generationOf(collectionName, uid) !== gen) {
          return readCachedItems(collectionName, uid);
        }
        if (Array.isArray(data)) {
          cacheManager.write(collectionName, uid, data, new Date().toISOString());
        }
        return data;
      } catch (fullErr) {
        rethrowAuth(fullErr);
        console.warn(`Full fetch failed for ${collectionName}, using stale cache:`, fullErr);
        return cached.items;
      }
    }
  }

  const key = inflightKey(collectionName, uid, !!bypassCache);
  return coalesce(key, async () => {
    if (!bypassCache) {
      try {
        return await hydrateFromNetwork(collectionName, uid, null);
      } catch (err) {
        rethrowAuth(err);
        console.warn(`Sync failed for ${collectionName}, falling back to full fetch:`, err);
      }
    }

    const gen = generationOf(collectionName, uid);
    const data = await fetchCollectionFull(collectionName, options);
    if (generationOf(collectionName, uid) !== gen) {
      return readCachedItems(collectionName, uid);
    }
    if (!bypassCache && Array.isArray(data)) {
      cacheManager.write(collectionName, uid, data, new Date().toISOString());
    }
    return data;
  });
}

/**
 * Reconcile with the server before the first paint so deletes/edits are not
 * applied as a trailing flash after showing a stale full cache.
 * Subscribers still receive put/merge updates. On network failure, fall back to cache.
 *
 * @param {string} collectionName
 * @param {(items: unknown[]) => void} onData
 * @param {{ admin?: boolean, onError?: (err: unknown) => void }} [options]
 */
export function watchCollection(collectionName, onData, options = {}) {
  let stopped = false;
  const emit = (items) => {
    if (!stopped) onData(Array.isArray(items) ? items : []);
  };

  const unsub = cacheManager.subscribe(collectionName, emit);

  fetchCollection(collectionName, { ...options, cacheFirst: false })
    .then(emit)
    .catch((err) => {
      if (stopped) return;
      const cached = cacheManager.read(collectionName, currentUid());
      if (cached?.items?.length) {
        emit(cached.items);
        return;
      }
      options.onError?.(err);
    });

  const LIVE_SYNC_MS = 2500;
  const live = collectionName === "messages" || collectionName === "channels";
  let timer = null;
  const poll = () => {
    if (stopped) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    fetchCollection(collectionName, { ...options, cacheFirst: false }).then(emit).catch(() => {});
  };
  const onVisibility = () => {
    if (typeof document !== "undefined" && document.visibilityState === "visible") poll();
  };
  if (live && typeof window !== "undefined") {
    timer = window.setInterval(poll, LIVE_SYNC_MS);
    document.addEventListener("visibilitychange", onVisibility);
  }

  return () => {
    stopped = true;
    unsub();
    if (timer) window.clearInterval(timer);
    if (live && typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisibility);
    }
  };
}

/**
 * @param {string} collectionName
 * @param {unknown[]} data
 * @param {{ admin?: boolean }} [options]
 */
export async function putCollection(collectionName, data, options = {}) {
  let res;
  try {
    res = await apiFetch(apiFetchPath(`/api/data/${encodeURIComponent(collectionName)}`, options), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(DATA_PUT_TIMEOUT_MS),
    });
  } catch (err) {
    if (isAbortLikeError(err)) {
      throw new DataApiError("The server timed out. Try again.", 504);
    }
    throw err;
  }

  if (!res.ok) {
    throw new DataApiError(await readErrorDetail(res), res.status);
  }

  const uid = currentUid();
  // Drop in-flight hydrates so a stale delta cannot overwrite the post-save refetch.
  bumpSyncGeneration(collectionName, uid);
  // Membership-filtered PUTs are incomplete vs server truth — do not paint them into
  // the sync cache (callers refetch). Other collections still seed from the payload.
  if (Array.isArray(data) && !PUT_BODY_IS_PARTIAL.has(collectionName)) {
    cacheManager.write(collectionName, uid, data, new Date().toISOString());
  } else if (!Array.isArray(data)) {
    cacheManager.clearCollection(collectionName, uid);
  }

  return res.json();
}

/**
 * Insert/update rows without rewriting (or soft-deleting) the rest of the collection.
 * Used for message send so the request is one INSERT, not a full table replace.
 *
 * @param {string} collectionName
 * @param {unknown[]} items
 * @param {{ admin?: boolean }} [options]
 */
export async function mergeCollection(collectionName, items, options = {}) {
  let res;
  try {
    res = await apiFetch(apiFetchPath(`/api/data/${encodeURIComponent(collectionName)}`, options), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ merge: true, items }),
      signal: AbortSignal.timeout(DATA_PUT_TIMEOUT_MS),
    });
  } catch (err) {
    if (isAbortLikeError(err)) {
      throw new DataApiError("The server timed out. Try again.", 504);
    }
    throw err;
  }

  if (!res.ok) {
    throw new DataApiError(await readErrorDetail(res), res.status);
  }

  const uid = currentUid();
  bumpSyncGeneration(collectionName, uid);
  if (PUT_BODY_IS_PARTIAL.has(collectionName)) {
    /* membership-filtered rows are incomplete vs server truth */
  } else if (Array.isArray(items)) {
    cacheManager.write(collectionName, uid, items, new Date().toISOString());
  }

  return res.json();
}

/**
 * @param {string} collectionName
 */
export function invalidateCollectionCache(collectionName) {
  bumpSyncGeneration(collectionName, currentUid());
  cacheManager.clearCollection(collectionName, currentUid());
}
