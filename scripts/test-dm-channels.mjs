/**
 * 1:1 DM channel id, visibility, and authorize rules.
 * Usage: node --import ./scripts/alias-loader.mjs scripts/test-dm-channels.mjs
 */
import assert from "node:assert/strict";
import {
  dmChannelId,
  findDmChannel,
  filterMessageItemsForActor,
  mergeChannelSavePayload,
  messageChannelTabs,
  otherDmMember,
} from "../lib/channels.js";
import { authorizeCollectionSave } from "../lib/server/authorize.js";

const alice = { name: "Alice", email: "alice@example.com", roles: ["user"] };
const bob = { name: "Bob", email: "bob@example.com", roles: ["user"] };
const eve = { name: "Eve", email: "eve@example.com", roles: ["user"] };
const admin = { name: "Admin", email: "admin@example.com", roles: ["user", "admin"] };

const id = dmChannelId("Bob@example.com", "alice@example.com");
assert.equal(id, dmChannelId("alice@example.com", "bob@example.com"));
assert.ok(id.startsWith("dm-"));

const dm = {
  id,
  kind: "dm",
  name: "Direct",
  memberEmails: ["alice@example.com", "bob@example.com"],
};
const group = {
  id: "credentials",
  name: "Credentials",
  memberEmails: ["alice@example.com", "bob@example.com"],
};

assert.equal(findDmChannel([dm, group], "alice@example.com", "bob@example.com")?.id, id);
assert.equal(otherDmMember(dm, "alice@example.com"), "bob@example.com");

const tabs = messageChannelTabs([group, dm]).map((t) => t.id);
assert.deepEqual(tabs, ["credentials", id]);
assert.ok(!tabs.includes("direct"));

const messages = [
  { id: "1", channel: id, email: "alice@example.com", wrappedKeys: [{ email: "alice@example.com" }, { email: "bob@example.com" }] },
  { id: "2", channel: "credentials", email: "bob@example.com", wrappedKeys: [{ email: "bob@example.com" }] },
  { id: "3", channel: "direct", email: "alice@example.com", to: ["eve@example.com"], wrappedKeys: [{ email: "eve@example.com" }] },
];
assert.deepEqual(filterMessageItemsForActor(messages, alice, [dm, group]).map((m) => m.id), ["1", "2", "3"]);
assert.deepEqual(filterMessageItemsForActor(messages, eve, [dm, group]).map((m) => m.id), ["3"]);

const hidden = { id: "ops", name: "Ops", memberEmails: ["eve@example.com"] };
const merged = mergeChannelSavePayload([group, dm, hidden], [group, dm], alice);
assert.ok(merged.some((c) => c.id === "ops"));

const groupDenied = authorizeCollectionSave("channels", [group], [group, { id: "x", name: "X", memberEmails: ["bob@example.com"] }], bob);
assert.equal(groupDenied.ok, false);

const created = authorizeCollectionSave(
  "channels",
  [group],
  [group, { id: "tmp", kind: "dm", name: "Direct", memberEmails: ["bob@example.com", "alice@example.com"] }],
  bob,
);
assert.equal(created.ok, true);
assert.equal(created.body.some((c) => c.id === id && c.kind === "dm"), true);

const steal = authorizeCollectionSave(
  "channels",
  [dm],
  [{ ...dm, memberEmails: ["bob@example.com", "eve@example.com"] }],
  bob,
);
assert.equal(steal.ok, false);

const adminGroup = authorizeCollectionSave(
  "channels",
  [],
  [{ id: "x", name: "X", memberEmails: ["Bob@Example.com", ""] }],
  admin,
);
assert.equal(adminGroup.ok, true);
assert.deepEqual(adminGroup.body[0].memberEmails, ["bob@example.com"]);

console.log("ok: dm channels");
