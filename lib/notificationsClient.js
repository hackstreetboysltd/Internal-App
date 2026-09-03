'use client';

import { useEffect, useRef, useState } from "react";
import { apiFetchPath, apiPath } from "@/lib/apiPath";
import { loadSessionUser } from "@/lib/session";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

function apiUrl(path) {
  return `${basePath}${path}`;
}

/** @type {Promise<{ notifications: Array<Record<string, unknown>>, unreadCount: number }> | null} */
let notificationsInFlight = null;

/**
 * @returns {Promise<{ notifications: Array<Record<string, unknown>>, unreadCount: number }>}
 */
export async function fetchNotifications(options = {}) {
  const unread = options.unreadOnly ? "?unread=1" : "";
  // Coalesce concurrent badge/panel loads so Strict Mode remounts don't
  // stampede the admin approval scan.
  if (!unread && notificationsInFlight) {
    return notificationsInFlight;
  }

  const run = (async () => {
    const res = await fetch(apiUrl(`/api/notifications${unread}`), {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`Notifications request failed (${res.status})`);
    }
    return res.json();
  })();

  if (!unread) {
    notificationsInFlight = run.finally(() => {
      notificationsInFlight = null;
    });
    return notificationsInFlight;
  }

  return run;
}

/**
 * @param {string[] | undefined} ids
 */
export async function markNotificationsRead(ids) {
  const res = await fetch(apiUrl("/api/notifications"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(ids && ids.length ? { ids } : {}),
  });
  if (!res.ok) {
    throw new Error(`Mark-read failed (${res.status})`);
  }
  return res.json();
}

/**
 * @param {{ email: string, name?: string }} payload
 */
export async function sendApprovalEmail(payload) {
  const res = await fetch(apiFetchPath("/api/notifications/approval-email"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Approval email failed (${res.status})`);
  }
  return res.json();
}

/**
 * @param {Record<string, unknown>} row
 * @param {string} [readerEmail]
 */
export function notificationVisibleToUser(row, readerEmail) {
  const email = String(readerEmail || loadSessionUser()?.email || "").trim().toLowerCase();
  const kind = String(row.kind || "");
  if (kind === "team") return true;
  if (kind === "admin") {
    return (loadSessionUser()?.roles || []).includes("admin");
  }
  const target = String(row.target_email || "").trim().toLowerCase();
  return target === email;
}

/**
 * @param {Record<string, unknown>} row
 */
export function describeNotificationRow(row) {
  const action = String(row.action || "");
  const moduleName = String(row.module || "");
  const item = String(row.item_name || "");
  const actor = String(row.actor_name || "Someone");

  if (row.kind === "assignee") {
    return `${actor} assigned you ${item}`;
  }
  if (row.kind === "direct") {
    if (action === "approved") return `${actor} approved ${item}`;
    if (action === "rejected") return `${actor} rejected ${item}`;
    return `${actor} ${action} ${item}`;
  }
  if (row.kind === "approval") {
    return item;
  }
  if (row.kind === "admin") {
    return `${actor} ${action} ${item} (${moduleName})`;
  }
  return `${actor} ${action} ${moduleName} — ${item}`;
}

/**
 * @param {string | null | undefined} linkPath
 */
export function hrefForNotificationLink(linkPath) {
  if (!linkPath) return null;
  const normalized = linkPath.startsWith("/") ? linkPath : `/${linkPath}`;
  return `${basePath}${normalized}`;
}

/**
 * Live unread count via SSE with polling fallback.
 * @param {(payload?: { refreshList?: boolean }) => void} [onEvent]
 */
export function useNotificationStream(onEvent) {
  const [unreadCount, setUnreadCount] = useState(0);
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    let cancelled = false;
    let source = null;
    /** @type {ReturnType<typeof setInterval> | null} */
    let fallbackTimer = null;

    const refreshCount = async () => {
      try {
        const data = await fetchNotifications();
        if (!cancelled) setUnreadCount(Number(data.unreadCount) || 0);
      } catch {
        /* ignore */
      }
    };

    const handlePayload = (payload) => {
      if (payload?.type !== "notification.created" || !payload.notification) return;
      const user = loadSessionUser();
      if (!notificationVisibleToUser(payload.notification, user?.email)) return;
      setUnreadCount((count) => count + 1);
      onEventRef.current?.({ refreshList: true });
    };

    refreshCount();

    try {
      source = new EventSource(apiPath("/api/notifications/stream"), { withCredentials: true });
      source.onmessage = (event) => {
        try {
          handlePayload(JSON.parse(event.data));
        } catch {
          /* ignore malformed */
        }
      };
      source.onerror = () => {
        source?.close();
        source = null;
        if (!fallbackTimer && !cancelled) {
          fallbackTimer = setInterval(refreshCount, 60_000);
        }
      };
    } catch {
      fallbackTimer = setInterval(refreshCount, 60_000);
    }

    return () => {
      cancelled = true;
      source?.close();
      if (fallbackTimer) clearInterval(fallbackTimer);
    };
  }, []);

  return unreadCount;
}
