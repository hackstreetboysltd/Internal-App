const BASE_PATH = "/Internal-App";

/**
 * Origin + basePath, e.g. http://localhost:3000/Internal-App
 */
export function getAppBaseUrl() {
  const raw = process.env.APP_URL || "http://localhost:3000/Internal-App";
  return raw.replace(/\/+$/, "");
}

/**
 * @param {string} path — app-relative, e.g. `/` or `/login/`
 */
export function appUrl(path = "/") {
  const base = getAppBaseUrl();
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (normalized === "/") {
    return `${base}/`;
  }
  return `${base}${normalized.endsWith("/") ? normalized : `${normalized}/`}`;
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
