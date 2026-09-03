'use client';

import { apiFetchPath, apiPath } from "@/lib/apiPath";
import { cacheManager } from "@/lib/cacheManager";
import { loadSessionUser, refreshAuthSession, waitForSessionReady } from "@/lib/session";

export class DataApiError extends Error {
  constructor(message, status, extra = {}) {
    super(message);
    this.name = "DataApiError";
    this.status = status;
    Object.assign(this, extra);
  }
}

/** @type {Map<string, Promise<unknown[]>>} */
const inflight = new Map();

function currentUid() {
  const user = loadSessionUser();
  return user?.uid || null;
}

function inflightKey(collectionName, uid, admin) {
  return `${uid || "anon"}:${collectionName}:${admin ? "a" : "u"}`;
}

async function apiFetch(url, init = {}) {
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
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.error || detail;
    } catch {
      /* ignore */
    }
    throw new DataApiError(detail, res.status);
  }

  return res.json();
}

/**
 * @param {string} collectionName
 */
async function fetchCollectionFull(collectionName, options = {}) {
  const res = await apiFetch(apiFetchPath(`/api/data/${encodeURIComponent(collectionName)}`, options));

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.error || detail;
    } catch {
      /* ignore */
    }
    throw new DataApiError(detail, res.status);
  }

  return res.json();
}

function rethrowAuth(err) {
  if (err instanceof DataApiError && (err.status === 401 || err.status === 403)) {
    throw err;
  }
}

async function hydrateFromNetwork(collectionName, uid, cached) {
  const stale = cacheManager.isStale(cached);
  if (cached?.items?.length && cached.cursor && !stale) {
    const delta = await syncCollection(collectionName, cached.cursor);
    return cacheManager.merge(collectionName, uid, delta);
  }

  try {
    const delta = await syncCollection(collectionName);
    return cacheManager.merge(collectionName, uid, delta);
  } catch (err) {
    rethrowAuth(err);
    console.warn(`Sync failed for ${collectionName}, falling back to full fetch:`, err);
    const data = await fetchCollectionFull(collectionName);
    if (Array.isArray(data)) {
      cacheManager.write(collectionName, uid, data, new Date().toISOString());
    }
    return data;
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
  const bypassCache = (options.admin || options.bypassCache) && !wantCache;
  const cacheFirst = (options.cacheFirst === true || wantCache) && !bypassCache;
  const cached = bypassCache ? null : cacheManager.read(collectionName, uid);

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
        const data = await fetchCollectionFull(collectionName, options);
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

    const data = await fetchCollectionFull(collectionName, options);
    if (!bypassCache && Array.isArray(data)) {
      cacheManager.write(collectionName, uid, data, new Date().toISOString());
    }
    return data;
  });
}

/**
 * Paint from localStorage immediately, then patch when the server delta arrives.
 * Mutation paths should keep calling `fetchCollection()` / `get()` (waits for network).
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

  const cached = cacheManager.read(collectionName, currentUid());
  if (cached?.items?.length) {
    emit(cached.items);
  }

  const unsub = cacheManager.subscribe(collectionName, emit);

  fetchCollection(collectionName, { ...options, cacheFirst: true })
    .then(emit)
    .catch((err) => {
      if (!stopped) options.onError?.(err);
    });

  return () => {
    stopped = true;
    unsub();
  };
}

/**
 * @param {string} collectionName
 * @param {unknown[]} data
 * @param {{ admin?: boolean }} [options]
 */
export async function putCollection(collectionName, data, options = {}) {
  const res = await apiFetch(apiFetchPath(`/api/data/${encodeURIComponent(collectionName)}`, options), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.error || detail;
    } catch {
      /* ignore */
    }
    throw new DataApiError(detail, res.status);
  }

  const uid = currentUid();
  if (!options.admin && Array.isArray(data)) {
    const cached = cacheManager.read(collectionName, uid);
    cacheManager.write(collectionName, uid, data, cached?.cursor ?? new Date().toISOString());
  } else {
    cacheManager.clearCollection(collectionName, uid);
  }

  return res.json();
}

/**
 * @param {string} collectionName
 */
export function invalidateCollectionCache(collectionName) {
  cacheManager.clearCollection(collectionName, currentUid());
}
