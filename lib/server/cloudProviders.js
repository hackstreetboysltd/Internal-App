/**
 * Detect managed cloud providers from connection URLs (Neon, Upstash, etc.).
 */

export function isServerlessRuntime() {
  return !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

/**
 * @param {string | undefined} url
 */
export function detectPostgresProvider(url) {
  if (!url) return "unknown";
  if (/neon\.tech/i.test(url)) return "neon";
  if (/supabase\.co/i.test(url)) return "supabase";
  if (/localhost|127\.0\.0\.1/i.test(url)) return "local";
  return "custom";
}

/**
 * @param {string | undefined} url
 */
export function detectRedisProvider(url) {
  if (!url) return "unknown";
  if (/upstash\.io/i.test(url)) return "upstash";
  if (/localhost|127\.0\.0\.1/i.test(url)) return "local";
  return "custom";
}

/**
 * Neon serverless should use the `-pooler` hostname on Vercel/Lambda.
 * @param {string | undefined} url
 */
export function postgresWarnings(url) {
  const warnings = [];
  if (!url) return warnings;

  if (
    isServerlessRuntime() &&
    /neon\.tech/i.test(url) &&
    !/-pooler\./i.test(url)
  ) {
    warnings.push(
      "Neon: use the pooled connection string (hostname contains -pooler) on Vercel.",
    );
  }

  if (/neon\.tech/i.test(url) && !/sslmode=require/i.test(url)) {
    warnings.push("Neon: append ?sslmode=require to DATABASE_URL.");
  }

  return warnings;
}

/**
 * Upstash free tier uses TLS; prefer rediss:// URLs from the console.
 * @param {string | undefined} url
 */
export function redisWarnings(url) {
  const warnings = [];
  if (!url) return warnings;

  if (/upstash\.io/i.test(url) && /^redis:\/\//i.test(url)) {
    warnings.push(
      "Upstash: use the TLS URL (rediss://) from the Upstash console.",
    );
  }

  return warnings;
}

/**
 * Force TLS for Upstash when only a redis:// URL was pasted.
 * @param {string} url
 */
export function normalizeRedisUrl(url) {
  if (/upstash\.io/i.test(url) && url.startsWith("redis://")) {
    return url.replace(/^redis:\/\//, "rediss://");
  }
  return url;
}
