export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "/Internal-App";

/**
 * Prefix an app API path with basePath for browser fetch().
 * @param {string} path — e.g. `/api/auth/me`
 */
export function apiPath(path) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const withSlash = normalized.endsWith("/") ? normalized : `${normalized}/`;
  return `${BASE_PATH}${withSlash}`;
}

/**
 * Browser fetch URL for an API route. Pass `{ admin: true }` for dual-mode data
 * routes that honor `?admin=1` together with the session admin role.
 * @param {string} path
 * @param {{ admin?: boolean }} [options]
 */
export function apiFetchPath(path, options = {}) {
  const base = apiPath(path);
  if (!options.admin) return base;
  if (typeof window === "undefined") {
    return `${base}${base.includes("?") ? "&" : "?"}admin=1`;
  }
  const url = new URL(base, window.location.origin);
  url.searchParams.set("admin", "1");
  return url.toString();
}
