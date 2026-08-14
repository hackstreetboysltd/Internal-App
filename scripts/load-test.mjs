/**
 * Concurrent request check against a running portal.
 * Usage: node scripts/load-test.mjs [baseUrl] [concurrency]
 */
const BASE = process.argv[2] || "http://localhost:3001/Internal-App";
const CONCURRENCY = Math.max(10, Number.parseInt(process.argv[3] || "40", 10) || 40);

async function fetchStatus(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, options);
  return res.status;
}

/**
 * @param {number} n
 * @param {() => Promise<number>} fn
 */
async function burst(n, fn) {
  /** @type {Record<string, number>} */
  const counts = {};
  const results = await Promise.all(Array.from({ length: n }, fn));
  for (const status of results) {
    const key = String(status);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

async function main() {
  console.log(`Load test ${CONCURRENCY} concurrent requests against ${BASE}`);

  const health = await burst(CONCURRENCY, () => fetchStatus("/api/health/"));
  console.log("GET /api/health/", health);
  if (!health["200"]) {
    throw new Error("Health burst returned no 200s");
  }

  const unauth = await burst(CONCURRENCY, () => fetchStatus("/api/auth/me"));
  console.log("GET /api/auth/me (no cookie)", unauth);
  if (!unauth["401"]) {
    throw new Error("Unauthenticated burst returned no 401s");
  }

  console.log("\nLoad test passed.");
}

main().catch((err) => {
  console.error("Load test failed:", err.message);
  process.exitCode = 1;
});
