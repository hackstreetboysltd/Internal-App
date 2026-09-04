/**
 * Regression: admin modules paint from warm cache; no sync-cache subscribe loops.
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
assert.match(portalApi, /function adminCollectionOpts/);
assert.match(portalApi, /cachedCollectionItems/);
assert.match(portalApi, /Instant first paint from warm cache/);

const adminWatchBlock = portalApi.match(/if \(isAdmin\) \{[\s\S]*?return watchCollection/)?.[0] || "";
assert.doesNotMatch(adminWatchBlock, /cacheManager\.subscribe/);
assert.match(adminWatchBlock, /cachedCollectionItems/);

// admin flag alone must not force a cold bypass anymore
assert.match(
  dataApi,
  /Only an explicit bypass skips the warm sync cache/,
);
assert.doesNotMatch(
  dataApi.match(/export async function fetchCollection[\s\S]*?const cached =/)?.[0] || "",
  /options\.admin \|\| options\.bypassCache/,
);

assert.match(dataApi, /Always seed the local cache with the saved payload/);
assert.match(goalsClient, /\}, \[watchEpoch\]\);/);

console.log("ok — admin fast-load guards in place");
