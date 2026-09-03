export const SESSION_TTL_SEC = 7 * 24 * 60 * 60;
export const SESSION_COOKIE_NAME = "sid";
export const CACHE_KEY_PREFIX = "portal:v1";

export const CHANNEL_API_REQUESTS = "channel:api:requests";
export const STREAM_API_REQUESTS = "stream:api:requests";
export const CHANNEL_API_ACTIVITY = "channel:api:activity";
export const STREAM_API_ACTIVITY = "stream:api:activity";
export const CHANNEL_PORTAL_NOTIFICATIONS = "channel:portal:notifications";
export const STREAM_PORTAL_NOTIFICATIONS = "stream:portal:notifications";

/** @returns {number} */
export function getSessionTtlSec() {
  const raw = process.env.SESSION_TTL_SEC;
  if (!raw) return SESSION_TTL_SEC;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : SESSION_TTL_SEC;
}

/** @returns {string} */
export function getSessionCookieName() {
  return process.env.SESSION_COOKIE_NAME || SESSION_COOKIE_NAME;
}

/**
 * Daily session rotation interval. `0` disables rotation.
 * @returns {number}
 */
export function getSessionRotateAfterSec() {
  const raw = process.env.SESSION_ROTATE_AFTER_SEC;
  if (raw === "0") return 0;
  if (!raw) return 24 * 60 * 60;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 24 * 60 * 60;
}

/** @returns {{ apiDays: number, activityDays: number }} */
export function getLogRetentionDays() {
  return {
    apiDays: envInt("API_LOG_RETENTION_DAYS", 30),
    activityDays: envInt("ACTIVITY_LOG_RETENTION_DAYS", 90),
  };
}

/** @returns {number} */
export function getSseBufferSize() {
  const raw = process.env.SSE_BUFFER_SIZE;
  if (!raw) return 500;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 500;
}

/** @returns {Record<string, number>} */
export function getRateLimits() {
  return {
    ip: envInt("RATE_LIMIT_IP_PER_MIN", 300),
    user: envInt("RATE_LIMIT_USER_PER_MIN", 120),
    sync: envInt("RATE_LIMIT_SYNC_PER_MIN", 30),
    activity: envInt("RATE_LIMIT_ACTIVITY_PER_MIN", 60),
    write: envInt("RATE_LIMIT_WRITE_PER_MIN", 20),
  };
}

/** @param {string} name @param {number} fallback */
function envInt(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
