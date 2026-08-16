'use client';

import { apiPath } from "@/lib/apiPath";
import { portalNowIso } from "@/lib/portalTime";

const TAB_SESSION_KEY = "portalTabSessionId";
const FLUSH_INTERVAL_MS = 5000;
const MAX_BATCH = 25;
const MAX_QUEUE = 200;

/** @type {{ eventType: string, path: string | null, meta: Record<string, unknown>, clientTs: string }[]} */
let queue = [];
let flushTimer = null;
let loginTracked = false;

function getTabSessionId() {
  if (typeof window === "undefined") return "";
  try {
    let id = sessionStorage.getItem(TAB_SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(TAB_SESSION_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

function scheduleFlush() {
  if (flushTimer || typeof window === "undefined") return;
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    flushActivity().catch(() => {});
  }, FLUSH_INTERVAL_MS);
}

/**
 * @param {string} eventType
 * @param {string | null | undefined} [path]
 * @param {Record<string, unknown>} [meta]
 */
export function trackActivity(eventType, path, meta = {}) {
  if (typeof window === "undefined") return;

  queue.push({
    eventType,
    path: path ?? window.location.pathname,
    meta,
    clientTs: portalNowIso(),
  });

  if (queue.length > MAX_QUEUE) {
    queue.splice(0, queue.length - MAX_QUEUE);
  }

  if (queue.length >= MAX_BATCH) {
    flushActivity().catch(() => {});
    return;
  }

  scheduleFlush();
}

export function trackLoginOnce(path) {
  if (loginTracked) return;
  loginTracked = true;
  trackActivity("auth.login", path || "/");
}

export function resetActivityTracker() {
  loginTracked = false;
  queue = [];
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}

/**
 * Flush queued activity events to the server.
 */
export async function flushActivity() {
  if (typeof window === "undefined" || queue.length === 0) return;

  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  const batch = queue.splice(0, MAX_BATCH);
  const tabSessionId = getTabSessionId();

  try {
    const res = await fetch(apiPath("/api/activity"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({ events: batch, tabSessionId }),
    });

    if (!res.ok) {
      queue.unshift(...batch);
    }
  } catch {
    queue.unshift(...batch);
  }

  if (queue.length > 0) {
    scheduleFlush();
  }
}

export function installActivityFlushHooks() {
  if (typeof window === "undefined") return () => {};

  const onHide = () => {
    if (document.visibilityState === "hidden") {
      flushActivity().catch(() => {});
    }
  };

  const onPageHide = () => {
    flushActivity().catch(() => {});
  };

  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("pagehide", onPageHide);

  return () => {
    document.removeEventListener("visibilitychange", onHide);
    window.removeEventListener("pagehide", onPageHide);
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
  };
}
