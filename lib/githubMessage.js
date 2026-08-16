/** Same-origin target for GitHub connect popup postMessage (never "*"). */
export function githubMessageOrigin() {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

/**
 * @param {MessageEvent} event
 */
export function isTrustedGithubMessage(event) {
  if (!event || event.origin !== githubMessageOrigin()) return false;
  const type = event.data?.type;
  return type === "GITHUB_CONNECTED" || type === "GITHUB_DISCONNECTED";
}
