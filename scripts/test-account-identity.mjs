/**
 * Account-scoped message identity: plan, profile pin/strip, wrap round-trip.
 * Usage: node --import ./scripts/alias-loader.mjs scripts/test-account-identity.mjs
 */
import assert from "node:assert/strict";

process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-session-secret-for-identity-wrap";

const {
  accountIdentityPlan,
  isPersistedIdentity,
  persistedIdentitiesMatch,
  stripMsgIdentityEnc,
  pinMsgIdentityEnc,
  sanitizeItemForClient,
  MSG_IDENTITY_ENC_FIELD,
} = await import("../lib/accountIdentity.js");
const { wrapMessageIdentity, unwrapMessageIdentity } = await import("../lib/server/messageIdentityCrypto.js");
const { authorizeCollectionSave } = await import("../lib/server/authorize.js");

assert.equal(accountIdentityPlan({ hasAccountIdentity: true, existingMail: true, localUnlocksMail: false }), "install-account");
assert.equal(accountIdentityPlan({ hasAccountIdentity: false, existingMail: false, localUnlocksMail: false }), "upload-local");
assert.equal(accountIdentityPlan({ hasAccountIdentity: false, existingMail: true, localUnlocksMail: true }), "upload-local");
assert.equal(accountIdentityPlan({ hasAccountIdentity: false, existingMail: true, localUnlocksMail: false }), "wait-for-account");
assert.equal(accountIdentityPlan({ hasAccountIdentity: false, existingMail: false, localUnlocksMail: false, inboxUnreliable: true }), "wait-for-account");

const identity = {
  format: 2,
  publicJwk: { kty: "EC", crv: "P-256", x: "aa", y: "bb" },
  privateJwk: { kty: "EC", crv: "P-256", x: "aa", y: "bb", d: "secret-d" },
  mlkemPublic: "pub",
  mlkemSecret: "sec",
};
assert.equal(isPersistedIdentity(identity), true);
assert.equal(persistedIdentitiesMatch(identity, { ...identity }), true);
assert.equal(persistedIdentitiesMatch(identity, { ...identity, mlkemPublic: "other" }), false);

const wrapped = wrapMessageIdentity(identity);
assert.notEqual(JSON.stringify(wrapped).includes("secret-d"), true);
const opened = unwrapMessageIdentity(wrapped);
assert.equal(opened.mlkemSecret, "sec");
assert.equal(opened.privateJwk.d, "secret-d");

const listed = stripMsgIdentityEnc({ email: "a@b.c", [MSG_IDENTITY_ENC_FIELD]: wrapped, name: "A" });
assert.equal(listed.email, "a@b.c");
assert.equal(listed[MSG_IDENTITY_ENC_FIELD], undefined);
assert.equal(
  sanitizeItemForClient("profile", { email: "a@b.c", [MSG_IDENTITY_ENC_FIELD]: wrapped })[MSG_IDENTITY_ENC_FIELD],
  undefined,
);
assert.equal(
  sanitizeItemForClient("messages", { id: "m1", [MSG_IDENTITY_ENC_FIELD]: wrapped })[MSG_IDENTITY_ENC_FIELD],
  wrapped,
);

const pinned = pinMsgIdentityEnc(
  { email: "a@b.c", [MSG_IDENTITY_ENC_FIELD]: wrapped },
  { email: "a@b.c", name: "Renamed", [MSG_IDENTITY_ENC_FIELD]: { v: 1, data: "stolen" } },
);
assert.deepEqual(pinned[MSG_IDENTITY_ENC_FIELD], wrapped);
assert.equal(pinned.name, "Renamed");

const alice = { email: "alice@example.com", roles: ["user"] };
const bob = { email: "bob@example.com", roles: ["user"] };
const bobRow = {
  id: "bob@example.com",
  email: "bob@example.com",
  name: "Bob",
  msgPub: { ecdh: { kty: "EC", crv: "P-256", x: "1", y: "2" }, mlkem: "bob-kem" },
  [MSG_IDENTITY_ENC_FIELD]: wrapped,
};
const aliceRow = {
  id: "alice@example.com",
  email: "alice@example.com",
  name: "Alice",
};

const eveSteals = authorizeCollectionSave(
  "profile",
  [bobRow, aliceRow],
  [
    { ...bobRow, [MSG_IDENTITY_ENC_FIELD]: { v: 1, data: "stolen" } },
    aliceRow,
  ],
  alice,
);
assert.equal(eveSteals.ok, true);
assert.deepEqual(
  eveSteals.body.find((p) => p.email === "bob@example.com")[MSG_IDENTITY_ENC_FIELD],
  wrapped,
  "foreign profile save cannot rotate Bob's private identity blob",
);

const bobSelf = authorizeCollectionSave(
  "profile",
  [bobRow],
  [{ ...bobRow, name: "Bobby", [MSG_IDENTITY_ENC_FIELD]: { v: 1, data: "rotated" } }],
  bob,
);
assert.equal(bobSelf.ok, true);
assert.deepEqual(
  bobSelf.body.find((p) => p.email === "bob@example.com")[MSG_IDENTITY_ENC_FIELD],
  wrapped,
  "owner profile save cannot rotate msgIdentityEnc; only the identity API writes it",
);
assert.equal(bobSelf.body.find((p) => p.email === "bob@example.com").name, "Bobby");

console.log("ok: account identity plan + wrap + profile pin");
