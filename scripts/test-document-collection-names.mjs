/**
 * Regression: document file ids are UUIDs. Clearing legacy docfiles_<id> on delete
 * used that id as a collection name, which rejects hyphens and 500s the API.
 */
import assert from "node:assert/strict";
import { isValidCollectionName } from "../lib/server/collectionNames.js";

const uuid = "550e8400-e29b-41d4-a716-446655440000";
assert.equal(isValidCollectionName(`docfiles_${uuid}`), false);
assert.equal(isValidCollectionName(`docfiles_${Date.now()}`), true);
assert.equal(isValidCollectionName("documents"), true);

console.log("ok — docfiles_<uuid> is invalid; delete must not PUT that collection");
