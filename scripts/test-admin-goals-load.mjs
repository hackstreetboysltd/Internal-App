/**
 * Regression: admin module loads must bypass sync cache and never cache-subscribe.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const portalApi = readFileSync(join(root, "lib/portalApi.js"), "utf8");
const dataApi = readFileSync(join(root, "lib/dataApi.js"), "utf8");
const goalsClient = readFileSync(join(root, "app/(portal)/goals/GoalsClient.js"), "utf8");

assert.match(portalApi, /ADMIN_PENDING_MERGE/);
assert.match(portalApi, /function adminFetchOptions/);
assert.match(portalApi, /bypassCache:\s*true/);
assert.match(portalApi, /Admin watch\(/);

// Must not reintroduce cache subscription on the admin watch path.
const adminWatchBlock = portalApi.match(/if \(isAdmin\) \{[\s\S]*?return watchCollection/)?.[0] || "";
assert.doesNotMatch(adminWatchBlock, /cacheManager\.subscribe/);

// Admin puts must write the saved payload, not clear to [].
assert.match(dataApi, /Always seed the local cache with the saved payload/);
assert.doesNotMatch(
  dataApi.match(/export async function putCollection[\s\S]*?return res\.json\(\);/)?.[0] || "",
  /if \(!options\.admin && Array\.isArray\(data\)\)/,
);

assert.match(goalsClient, /\}, \[watchEpoch\]\);/);
assert.doesNotMatch(goalsClient, /\}, \[searchParams, watchEpoch\]\);/);
assert.match(goalsClient, /admin:\s*false/);

console.log("ok — admin module load guards in place");
