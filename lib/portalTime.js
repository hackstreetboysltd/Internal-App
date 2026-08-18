import { useEffect, useState } from "react";
import { apiPath } from "@/lib/apiPath";

export const PORTAL_TZ = process.env.NEXT_PUBLIC_PORTAL_TZ || "Africa/Nairobi";

const TIME_OPTS = {
  timeZone: PORTAL_TZ,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
};

const STAMP_OPTS = {
  ...TIME_OPTS,
  fractionalSecondDigits: 3,
};

/** @type {Set<(state: { nowMs: number, source: string, timeZone: string }) => void>} */
const listeners = new Set();
let offsetMs = 0;
let source = "pending";
let timeZone = PORTAL_TZ;
let started = false;

function snapshot() {
  return {
    nowMs: Date.now() + offsetMs,
    source,
    timeZone,
  };
}

function emit() {
  const next = snapshot();
  for (const cb of listeners) cb(next);
}

async function syncFromServer() {
  const t0 = Date.now();
  const res = await fetch(apiPath("/api/time"), { credentials: "include", cache: "no-store" });
  const t1 = Date.now();
  if (!res.ok) throw new Error(`time → ${res.status}`);
  const data = await res.json();
  const serverMs = Date.parse(data.now);
  if (Number.isFinite(serverMs)) {
    offsetMs = serverMs - Math.round((t0 + t1) / 2);
  }
  if (data.source) source = data.source;
  if (data.timeZone) timeZone = data.timeZone;
}

function ensureStarted() {
  if (started || typeof window === "undefined") return;
  started = true;
  syncFromServer()
    .catch(() => {
      source = "device";
    })
    .finally(() => emit());
  setInterval(emit, 30_000);
  setInterval(() => {
    syncFromServer().catch(() => {});
  }, 10 * 60 * 1000);
}

/**
 * @param {unknown} value
 * @param {{ withMs?: boolean }} [options]
 */
export function formatPortalTime(value, options = {}) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleTimeString("en-GB", options.withMs === false ? TIME_OPTS : STAMP_OPTS);
}

const CLOCK_IDLE = { nowMs: 0, source: "pending", timeZone: PORTAL_TZ };

/**
 * Subscribe to server-synced clock ticks without React state.
 * @param {(state: { nowMs: number, source: string, timeZone: string }) => void} listener
 */
export function subscribeServerClock(listener) {
  listeners.add(listener);
  ensureStarted();
  listener(snapshot());
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Live clock using server-synced UTC, formatted in the portal timezone.
 * Starts idle so SSR and the first client render match (avoids hydration mismatch).
 */
export function useServerClock() {
  const [state, setState] = useState(CLOCK_IDLE);
  useEffect(() => subscribeServerClock(setState), []);
  return state;
}

export function getPortalTimeZone() {
  return timeZone;
}

export function portalNowMs() {
  ensureStarted();
  return Date.now() + offsetMs;
}

export function portalNowIso() {
  return new Date(portalNowMs()).toISOString();
}

let lastId = 0;
export function nextPortalId() {
  const n = portalNowMs();
  if (n <= lastId) {
    lastId += 1;
    return lastId;
  }
  lastId = n;
  return n;
}

/**
 * @param {number} [ms]
 */
export function portalDateParts(ms = portalNowMs()) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  /** @type {Record<string, string>} */
  const bag = {};
  for (const part of fmt.formatToParts(new Date(ms))) {
    if (part.type !== "literal") bag[part.type] = part.value;
  }
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour: Number(bag.hour),
    minute: Number(bag.minute),
  };
}

export function portalTodayStr() {
  const p = portalDateParts();
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/**
 * @param {number} [ms]
 */
export function formatPortalDateTime(ms = portalNowMs()) {
  return new Date(ms).toLocaleString("en-US", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * @param {unknown} value
 */
export function formatPortalCreatedStamp(value) {
  const ms = typeof value === "number" ? value : Date.parse(String(value || ""));
  if (!Number.isFinite(ms) || !ms) return { time: "", date: "" };
  const d = new Date(ms);
  const time = d.toLocaleTimeString("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  const date = d.toLocaleDateString("en-GB", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  return { time, date };
}
