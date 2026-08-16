/**
 * True-time helpers. The host clock can be wrong in local/dev, so we
 * periodically sample a public UTC source and apply an offset.
 */

const STALE_MS = 10 * 60 * 1000;

let offsetMs = 0;
let lastSyncAt = 0;
/** @type {string} */
let source = "host";
/** @type {Promise<void> | null} */
let inFlight = null;

/**
 * @returns {string}
 */
export function portalTimeZone() {
  return process.env.PORTAL_TZ || process.env.NEXT_PUBLIC_PORTAL_TZ || "Africa/Nairobi";
}

/**
 * @returns {Promise<number | null>}
 */
async function fetchRemoteUtcMs() {
  try {
    const res = await fetch("https://cloudflare.com/cdn-cgi/trace", {
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    if (res.ok) {
      const text = await res.text();
      const match = text.match(/(?:^|\n)ts=([\d.]+)/);
      if (match) {
        const ms = Number.parseFloat(match[1]) * 1000;
        if (Number.isFinite(ms) && ms > 0) return Math.round(ms);
      }
    }
  } catch {
    /* try Date header next */
  }

  try {
    const res = await fetch("https://www.google.com/generate_204", {
      method: "HEAD",
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
      redirect: "follow",
    });
    const hdr = res.headers.get("date");
    const ms = hdr ? Date.parse(hdr) : NaN;
    if (Number.isFinite(ms)) return ms;
  } catch {
    /* fall through */
  }

  return null;
}

export async function syncRealTime() {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const remote = await fetchRemoteUtcMs();
      if (remote != null) {
        offsetMs = remote - Date.now();
        source = "network";
      } else {
        source = "host";
      }
      lastSyncAt = Date.now();
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

export async function ensureRealTime() {
  if (!lastSyncAt) {
    await syncRealTime();
    return;
  }
  if (Date.now() - lastSyncAt > STALE_MS) {
    syncRealTime().catch(() => {});
  }
}

export function realNowMs() {
  if (!lastSyncAt || Date.now() - lastSyncAt > STALE_MS) {
    syncRealTime().catch(() => {});
  }
  return Date.now() + offsetMs;
}

export function realNowIso() {
  return new Date(realNowMs()).toISOString();
}

/**
 * @param {number} ms
 */
export function realAgoIso(ms) {
  return new Date(realNowMs() - ms).toISOString();
}

export function realNowUnix() {
  return Math.floor(realNowMs() / 1000);
}

export function realTimeSource() {
  return source;
}

/**
 * @param {number} [ms]
 */
export function formatPortalDateTime(ms = realNowMs()) {
  return new Date(ms).toLocaleString("en-US", {
    timeZone: portalTimeZone(),
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * @param {number} [ms]
 */
export function realNowParts(ms = realNowMs()) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: portalTimeZone(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
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
  };
}
