const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "/Internal-App";

/**
 * Origin + basePath, e.g. http://localhost:3000/Internal-App
 */
export function getAppBaseUrl() {
  const raw = process.env.APP_URL || "http://localhost:3000/Internal-App";
  return raw.replace(/\/+$/, "");
}

/**
 * @param {string} path — app-relative, e.g. `/`, `/login/`, or `/login/?notAllowed=1`
 */
export function appUrl(path = "/") {
  const base = getAppBaseUrl();
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (normalized === "/") {
    return `${base}/`;
  }

  // Keep query/hash intact — do not append trailing slash after `?` / `#`
  // (otherwise `/login/?notAllowed=1` becomes `...?notAllowed=1/`).
  const qIndex = normalized.indexOf("?");
  const hIndex = normalized.indexOf("#");
  let cut = normalized.length;
  if (qIndex >= 0) cut = Math.min(cut, qIndex);
  if (hIndex >= 0) cut = Math.min(cut, hIndex);

  const pathname = normalized.slice(0, cut);
  const suffix = normalized.slice(cut);
  const withSlash = pathname.endsWith("/") ? pathname : `${pathname}/`;
  return `${base}${withSlash}${suffix}`;
}

/**
 * Only allow same-origin relative redirects.
 * @param {string | undefined | null} returnTo
 */
export function safeReturnPath(returnTo) {
  if (!returnTo || typeof returnTo !== "string") {
    return "/";
  }
  if (!returnTo.startsWith("/") || returnTo.startsWith("//")) {
    return "/";
  }
  return returnTo;
}

export function getCookiePath() {
  return BASE_PATH;
}
