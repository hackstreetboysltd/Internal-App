/**
 * Public portal href for email CTAs. Local APP_URL and the old GitHub Pages
 * host must never ship in "Open Portal" — mail always opens production.
 */

export const CANONICAL_PRODUCTION_PORTAL_URL =
  "https://hackstreetboysltd-internal-app.vercel.app/Internal-App";

const CANONICAL_HOST = "hackstreetboysltd-internal-app.vercel.app";

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizePortalHref(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  try {
    const href = trimmed.includes("://") ? trimmed : `https://${trimmed}`;
    const url = new URL(href);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    const path = url.pathname.replace(/\/+$/, "") || "";
    const withBase = path && path !== "/" ? `${url.origin}${path}` : url.origin;
    return `${withBase.replace(/\/+$/, "")}/`;
  } catch {
    return "";
  }
}

/**
 * @param {unknown} raw
 * @returns {boolean}
 */
export function isUnusableEmailPortalUrl(raw) {
  const href = String(raw || "").trim().toLowerCase();
  if (!href) return true;
  if (
    href.includes("localhost")
    || href.includes("127.0.0.1")
    || href.includes("[::1]")
    || href.includes("0.0.0.0")
  ) {
    return true;
  }
  if (href.includes("github.io") || href.includes("github.com")) return true;
  try {
    const url = new URL(href.includes("://") ? href : `https://${href}`);
    if (url.hostname.endsWith(".vercel.app") && url.hostname !== CANONICAL_HOST) {
      return true;
    }
  } catch {
    return true;
  }
  return false;
}

/**
 * Href for EmailJS {{portal_url}} / Open Portal.
 * @param {NodeJS.ProcessEnv} [env]
 */
export function getEmailPortalUrl(env = process.env) {
  const candidates = [
    env.PRODUCTION_PORTAL_URL,
    env.NEXT_PUBLIC_PORTAL_URL,
    env.VERCEL_ENV === "production" && env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${String(env.VERCEL_PROJECT_PRODUCTION_URL).replace(/\/+$/, "")}/Internal-App`
      : "",
    env.APP_URL,
  ];
  for (const candidate of candidates) {
    if (isUnusableEmailPortalUrl(candidate)) continue;
    const href = normalizePortalHref(candidate);
    if (href) return href;
  }
  return normalizePortalHref(CANONICAL_PRODUCTION_PORTAL_URL);
}

/**
 * Absolute Open Portal href for an app-relative path (e.g. `/messages/?room=eng`).
 * @param {string} [path]
 * @param {NodeJS.ProcessEnv} [env]
 */
export function emailPortalUrlForPath(path = "/", env = process.env) {
  const base = getEmailPortalUrl(env).replace(/\/+$/, "");
  const raw = String(path || "/").trim() || "/";
  const normalized = raw.startsWith("/") ? raw : `/${raw}`;

  const qIndex = normalized.indexOf("?");
  const hIndex = normalized.indexOf("#");
  let cut = normalized.length;
  if (qIndex >= 0) cut = Math.min(cut, qIndex);
  if (hIndex >= 0) cut = Math.min(cut, hIndex);

  const pathname = normalized.slice(0, cut);
  const suffix = normalized.slice(cut);
  if (!pathname || pathname === "/") {
    return `${base}/${suffix.replace(/^\?/, "?")}`;
  }
  const withSlash = pathname.endsWith("/") ? pathname : `${pathname}/`;
  return `${base}${withSlash}${suffix}`;
}

/**
 * Origin header for the EmailJS REST call (no path).
 * @param {NodeJS.ProcessEnv} [env]
 */
export function getEmailJsOrigin(env = process.env) {
  const explicit = String(env.EMAILJS_ORIGIN || "").trim();
  if (explicit) {
    try {
      return new URL(explicit.includes("://") ? explicit : `https://${explicit}`).origin;
    } catch {
      /* fall through */
    }
  }
  try {
    return new URL(getEmailPortalUrl(env)).origin;
  } catch {
    return "https://hackstreetboysltd-internal-app.vercel.app";
  }
}
