'use client';

import { apiPath } from "@/lib/apiPath";
import { cacheManager } from "@/lib/cacheManager";
import { loadSessionUser } from "@/lib/session";

export class DataApiError extends Error {
  constructor(message, status, extra = {}) {
    super(message);
    this.name = "DataApiError";
    this.status = status;
    Object.assign(this, extra);
  }
}

function currentUid() {
  const user = loadSessionUser();
  return user?.uid || null;
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

  const res = await fetch(url.toString(), {
    credentials: "include",
    cache: "no-store",
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

  return res.json();
}

/**
 * @param {string} collectionName
 */
async function fetchCollectionFull(collectionName, options = {}) {
  const url = new URL(apiPath(`/api/data/${encodeURIComponent(collectionName)}`), window.location.origin);
  if (options.admin) {
    url.searchParams.set("admin", "1");
  }

  const res = await fetch(url.toString(), {
    credentials: "include",
    cache: "no-store",
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

  return res.json();
}

/**
 * @param {string} collectionName
 * @param {{ admin?: boolean, bypassCache?: boolean }} [options]
 */
export async function fetchCollection(collectionName, options = {}) {
  const uid = currentUid();
  const bypassCache = options.admin || options.bypassCache;

  if (!bypassCache) {
    const cached = cacheManager.read(collectionName, uid);
    if (cached?.items?.length) {
      try {
        const delta = await syncCollection(collectionName, cached.cursor);
        return cacheManager.merge(collectionName, uid, delta);
      } catch (err) {
        if (err instanceof DataApiError && (err.status === 401 || err.status === 403)) {
          throw err;
        }
        console.warn(`Sync failed for ${collectionName}, using stale cache:`, err);
        return cached.items;
      }
    }
  }

  const data = await fetchCollectionFull(collectionName, options);
  if (!bypassCache && Array.isArray(data)) {
    try {
      const delta = await syncCollection(collectionName);
      cacheManager.write(collectionName, uid, data, delta.cursor);
    } catch {
      cacheManager.write(collectionName, uid, data, new Date().toISOString());
    }
  }
  return data;
}

/**
 * @param {string} collectionName
 * @param {unknown[]} data
 * @param {{ admin?: boolean }} [options]
 */
export async function putCollection(collectionName, data, options = {}) {
  const url = new URL(apiPath(`/api/data/${encodeURIComponent(collectionName)}`), window.location.origin);
  if (options.admin) {
    url.searchParams.set("admin", "1");
  }

  const res = await fetch(url.toString(), {
    method: "PUT",
    credentials: "include",
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
