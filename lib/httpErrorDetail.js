/**
 * Firefox HTTP/2 often leaves statusText empty. Never surface a blank API error.
 * @param {number} status
 * @param {string} [statusText]
 * @param {unknown} [body]
 */
export function httpErrorDetail(status, statusText, body) {
  const fromBody = body && typeof body === "object" && typeof /** @type {{ error?: unknown }} */ (body).error === "string"
    ? /** @type {{ error: string }} */ (body).error.trim()
    : "";
  if (fromBody) return fromBody;
  const fromStatus = String(statusText || "").trim();
  if (fromStatus) return fromStatus;
  const code = Number(status);
  if (code === 504 || code === 408) return "The server timed out. Try again.";
  if (code === 413) return "That save was too large.";
  if (code === 429) return "Too many requests";
  if (code === 401) return "Unauthorized";
  if (Number.isFinite(code) && code > 0) return `HTTP ${code}`;
  return "Request failed";
}

export const DATA_PUT_TIMEOUT_MS = 15_000;

/**
 * @param {unknown} err
 */
export function isAbortLikeError(err) {
  if (!err || typeof err !== "object") return false;
  const name = String(/** @type {{ name?: unknown }} */ (err).name || "");
  return name === "AbortError" || name === "TimeoutError";
}
