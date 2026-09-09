/**
 * Regression: watch reconciles disparity before first paint; puts invalidate stale hydrates.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataApi = readFileSync(join(root, "lib/dataApi.js"), "utf8");
const cacheManager = readFileSync(join(root, "lib/cacheManager.js"), "utf8");
const portalApi = readFileSync(join(root, "lib/portalApi.js"), "utf8");
const documentsClient = readFileSync(join(root, "app/(portal)/documents/DocumentsClient.js"), "utf8");

const watchBlock = dataApi.match(/export function watchCollection[\s\S]*?^}/m)?.[0] || "";
assert.match(watchBlock, /cacheFirst: false/);
// Must not paint warm cache before the sync fetch starts (error fallback emit is ok).
assert.match(
  watchBlock,
  /const unsub = cacheManager\.subscribe\(collectionName, emit\);\s*\n\s*fetchCollection/,
);
assert.match(dataApi, /bumpSyncGeneration/);
assert.match(dataApi, /generationOf\(collectionName, uid\) !== gen/);

assert.match(cacheManager, /Empty disparity/);
assert.match(portalApi, /await disparity sync before returning/);

assert.match(documentsClient, /snapshotDocuments/);
assert.match(documentsClient, /setRecords\(Array\.isArray\(list\) \? list : \[\]\)/);
assert.doesNotMatch(
  documentsClient.match(/const saveDocuments = async[\s\S]*?^    \};/m)?.[0] || "",
  /await get\("documents"\)/,
);

console.log("ok — sync-before-paint guards in place");
