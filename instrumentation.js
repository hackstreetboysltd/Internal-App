/**
 * Runs once when the Next.js Node server starts.
 * Prefer IPv4 for outbound HTTPS — broken/partial IPv6 makes Node's
 * dual-stack connect time out (Google OAuth token exchange, etc.).
 */
export async function register() {
  // Keep node:dns out of this file so Edge analysis does not warn.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation.node.js");
  }
}
