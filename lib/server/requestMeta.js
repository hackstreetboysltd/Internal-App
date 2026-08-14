/**
 * @param {import('next/server').NextRequest} request
 */
export function getClientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return request.headers.get("x-real-ip") || "unknown";
}

/**
 * Normalize pathname for logs (strip basePath when present).
 * @param {import('next/server').NextRequest} request
 */
export function getRequestPath(request) {
  const url = new URL(request.url);
  let path = url.pathname;
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/Internal-App";
  if (path.startsWith(basePath)) {
    path = path.slice(basePath.length) || "/";
  }
  return path;
}

/**
 * @param {import('next/server').NextRequest} request
 */
export function getQueryObject(request) {
  const url = new URL(request.url);
  return Object.fromEntries(url.searchParams.entries());
}
