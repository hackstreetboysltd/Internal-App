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
