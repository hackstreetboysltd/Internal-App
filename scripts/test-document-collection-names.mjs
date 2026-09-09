/**
 * Regression: document file ids are UUIDs. Clearing legacy docfiles_<id> on delete
 * used that id as a collection name, which rejects hyphens and 500s the API.
 * Opening must also skip that invalid legacy path instead of syncing it.
 */
import assert from "node:assert/strict";
import {
  isValidCollectionName,
  legacyDocFilesCollectionName,
} from "../lib/server/collectionNames.js";

const uuid = "550e8400-e29b-41d4-a716-446655440000";
const legacyTs = String(Date.now());

assert.equal(isValidCollectionName(`docfiles_${uuid}`), false);
assert.equal(isValidCollectionName(`docfiles_${legacyTs}`), true);
assert.equal(isValidCollectionName("documents"), true);

assert.equal(legacyDocFilesCollectionName(uuid), null);
assert.equal(legacyDocFilesCollectionName(legacyTs), `docfiles_${legacyTs}`);
assert.equal(legacyDocFilesCollectionName(""), null);
assert.equal(legacyDocFilesCollectionName(null), null);

console.log("ok — docfiles_<uuid> is invalid; open/delete must not hit that collection");
