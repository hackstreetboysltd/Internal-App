/**
 * Channel-add and new-message email intents.
 * Usage: node --import ./scripts/alias-loader.mjs scripts/test-secure-notices.mjs
 */
import assert from "node:assert/strict";
import { buildCollectionIntents } from "../lib/server/notifications/rules.js";
import {
  SECURE_CHANNEL_ADDED,
  SECURE_MESSAGE_RECEIVED,
  isSecureNoticeAction,
  secureNoticeEmailCopy,
} from "../lib/server/notifications/emailCopy.js";

const alice = "alice@example.com";
const bob = "bob@example.com";
const eve = "eve@example.com";

function targets(intents) {
  return intents.map((i) => i.targetEmail).sort();
}

assert.equal(SECURE_CHANNEL_ADDED, "You have been added to this secure channel. Check it out");
assert.equal(SECURE_MESSAGE_RECEIVED, "You have received a secure message. Check it out");
assert.equal(isSecureNoticeAction(SECURE_CHANNEL_ADDED), true);
assert.equal(isSecureNoticeAction(SECURE_MESSAGE_RECEIVED), true);
assert.equal(isSecureNoticeAction("reviewed your completed goal"), false);

const copy = secureNoticeEmailCopy({
  subject: SECURE_MESSAGE_RECEIVED,
  timestamp: "now",
  portalUrl: "https://example.com",
});
assert.equal(copy.subject, SECURE_MESSAGE_RECEIVED);
assert.equal(copy.headline, "");
assert.equal(copy.detail_text, "");
assert.equal(copy.eyebrow, "");
assert.equal(copy.actor_name, "");

const newChannel = {
  id: "eng",
  name: "Engineering",
  kind: "group",
  memberEmails: [alice, bob, "BOB@example.com", eve],
};
const createdChannel = buildCollectionIntents("channels", [], [newChannel], { actorEmail: alice });
assert.deepEqual(targets(createdChannel), [bob, eve]);
for (const intent of createdChannel) {
  assert.equal(intent.kind, "direct");
  assert.equal(intent.secureNotice, true);
  assert.equal(intent.action, SECURE_CHANNEL_ADDED);
  assert.equal(intent.module, "Messages");
  assert.equal(intent.linkPath, "/messages/");
}

const addedLater = buildCollectionIntents(
  "channels",
  [{ id: "eng", kind: "group", memberEmails: [alice, bob] }],
  [{ id: "eng", kind: "group", memberEmails: [alice, bob, eve] }],
  { actorEmail: alice },
);
assert.deepEqual(targets(addedLater), [eve]);

const renameOnly = buildCollectionIntents(
  "channels",
  [{ id: "eng", kind: "group", name: "Eng", memberEmails: [alice, bob] }],
  [{ id: "eng", kind: "group", name: "Engineering", memberEmails: [alice, bob] }],
  { actorEmail: alice },
);
assert.deepEqual(targets(renameOnly), []);

const dmId = "dm-alice_40example.com--bob_40example.com";
const dmCreated = buildCollectionIntents(
  "channels",
  [],
  [{ id: dmId, kind: "dm", memberEmails: [alice, bob] }],
  { actorEmail: alice },
);
assert.deepEqual(targets(dmCreated), [], "starting a DM must not send the channel-added email");

const newMessage = {
  id: "m1",
  email: alice,
  channel: "eng",
  to: [bob, eve, alice],
  wrappedKeys: [
    { type: "hybrid", email: bob },
    { type: "hybrid", email: "EVE@example.com" },
    { type: "hybrid", email: alice },
    { type: "hybrid", email: "not-an-email" },
  ],
};
const createdMessage = buildCollectionIntents("messages", [], [newMessage], { actorEmail: alice });
assert.deepEqual(targets(createdMessage), [bob, eve]);
for (const intent of createdMessage) {
  assert.equal(intent.kind, "direct");
  assert.equal(intent.secureNotice, true);
  assert.equal(intent.action, SECURE_MESSAGE_RECEIVED);
  assert.equal(intent.module, "Messages");
  assert.equal(intent.linkPath, "/messages/");
}

const dmMessage = buildCollectionIntents(
  "messages",
  [],
  [{
    id: "m2",
    email: alice,
    channel: dmId,
    to: [bob],
    wrappedKeys: [{ type: "hybrid", email: bob }],
  }],
  { actorEmail: alice },
);
assert.deepEqual(targets(dmMessage), [bob]);

const editedMessage = buildCollectionIntents(
  "messages",
  [newMessage],
  [{ ...newMessage, cipher: "new-cipher" }],
  { actorEmail: alice },
);
assert.deepEqual(targets(editedMessage), [], "edits must not re-notify");

console.log("secure notice assertions passed");
