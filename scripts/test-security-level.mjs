/**
 * Access model tests: A/B record ACL is off; channel membership + admin vs user remain.
 * Usage: node --import ./scripts/alias-loader.mjs scripts/test-security-level.mjs
 */
import assert from "node:assert/strict";
import {
  DEFAULT_SECURITY_LEVEL,
  normalizeSecurityLevel,
  securityLevelOf,
  collectionUsesSecurityLevel,
} from "@/lib/securityLevel.js";
import {
  actorCanReadRecord,
  authorizeCollectionSave,
  filterChannelItemsForActor,
  filterItemsForActor,
} from "@/lib/server/authorize.js";

function ok(label) {
  console.log("ok:", label);
}

assert.equal(normalizeSecurityLevel(undefined), "B");
assert.equal(normalizeSecurityLevel("a"), "A");
assert.equal(securityLevelOf({ id: 1, securityLevel: "A" }), "A");
assert.equal(collectionUsesSecurityLevel("apps"), false);
assert.equal(collectionUsesSecurityLevel("messages"), false);
assert.equal(collectionUsesSecurityLevel("channels"), false);
ok("helpers / A/B collection gate disabled");

const admin = { name: "Admin", email: "admin@example.com", roles: ["user", "admin"] };
const alice = { name: "Alice", email: "alice@example.com", roles: ["user"] };
const bob = { name: "Bob", email: "bob@example.com", roles: ["user"] };

const aItem = {
  id: "a1",
  author: "Alice",
  email: "alice@example.com",
  securityLevel: "A",
  name: "secret",
};
const bItem = {
  id: "b1",
  author: "Bob",
  email: "bob@example.com",
  securityLevel: "B",
  name: "public",
};

// A/B no longer hides records from allowlisted users.
assert.equal(actorCanReadRecord(aItem, bob), true);
assert.equal(actorCanReadRecord(aItem, alice), true);
assert.deepEqual(
  filterItemsForActor([aItem, bItem], bob).map((i) => i.id),
  ["a1", "b1"],
);
ok("record reads are not A/B filtered");

const channelA = {
  id: "creds",
  name: "Credentials",
  memberEmails: ["alice@example.com", "bob@example.com"],
};
const channelB = {
  id: "ops",
  name: "Ops",
  memberEmails: ["bob@example.com"],
};
assert.deepEqual(
  filterChannelItemsForActor([channelA, channelB], bob).map((c) => c.id),
  ["creds", "ops"],
);
assert.deepEqual(
  filterChannelItemsForActor([channelA, channelB], alice).map((c) => c.id),
  ["creds"],
);
assert.deepEqual(
  filterChannelItemsForActor([channelA, channelB], admin).map((c) => c.id),
  [],
);
assert.deepEqual(
  filterChannelItemsForActor([channelA, channelB], admin, { adminSeesAll: true }).map((c) => c.id),
  ["creds", "ops"],
);
ok("channel membership still enforced");

const saveOk = authorizeCollectionSave(
  "apps",
  [],
  [{ id: "n1", author: "Bob", email: "bob@example.com", name: "App" }],
  bob,
);
assert.equal(saveOk.ok, true);
assert.equal(saveOk.body[0].securityLevel, undefined);

const channelDenied = authorizeCollectionSave(
  "channels",
  [],
  [{ id: "x", name: "X", memberEmails: ["bob@example.com"] }],
  bob,
);
assert.equal(channelDenied.ok, false);
assert.equal(channelDenied.status, 403);

const channelAdmin = authorizeCollectionSave(
  "channels",
  [],
  [{ id: "x", name: "X", memberEmails: ["Bob@Example.com", ""] }],
  admin,
);
assert.equal(channelAdmin.ok, true);
assert.deepEqual(channelAdmin.body[0].memberEmails, ["bob@example.com"]);
ok("authorize: apps open; channels admin-only");

console.log("All access-model tests passed.");
void DEFAULT_SECURITY_LEVEL;
