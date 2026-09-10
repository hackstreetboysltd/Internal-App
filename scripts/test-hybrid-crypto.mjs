/**
 * Hybrid ML-KEM + ECDH envelope round-trip (enc v5).
 * Usage: node --import ./scripts/alias-loader.mjs scripts/test-hybrid-crypto.mjs
 */
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const {
  ENC_VERSION,
  loadIdentity,
  identityMsgPub,
  normalizeMsgPub,
  encryptSealedEnvelope,
  decryptMessage,
  isEnvelopeMessage,
  resolveRecipientMsgPub,
  NOT_ADDRESSED,
  DECRYPT_INVALID,
  DECRYPT_MISMATCH,
} = await import("../app/(portal)/messages/crypto.js");

assert.equal(ENC_VERSION, 5);

const aliceId = await loadIdentity("alice@example.com");
const alicePub = identityMsgPub(aliceId);
assert.ok(normalizeMsgPub(alicePub));

const bobId = await loadIdentity("bob@example.com");
const bobPub = identityMsgPub(bobId);
assert.ok(normalizeMsgPub(bobPub));

const plain = "<p>Hello hybrid world</p>";
const envelope = await encryptSealedEnvelope(
  plain,
  [
    { email: "alice@example.com", msgPub: alicePub },
    { email: "bob@example.com", msgPub: bobPub },
  ],
  "alice@example.com",
);

assert.equal(envelope.enc, 5);
assert.equal(envelope.wrappedKeys.length, 2);
assert.ok(envelope.wrappedKeys.every((w) => w.type === "hybrid"));
assert.ok(isEnvelopeMessage(envelope));

const forBob = await decryptMessage(envelope, null, "bob@example.com");
assert.equal(forBob, plain);

const forAlice = await decryptMessage(envelope, null, "alice@example.com");
assert.equal(forAlice, plain);

const forEve = await decryptMessage(envelope, null, "eve@example.com");
assert.equal(forEve, NOT_ADDRESSED);

assert.equal(await decryptMessage({ enc: 4, cipher: "x", iv: "y", wrappedKeys: [] }, null, "bob@example.com"), DECRYPT_INVALID);

assert.equal(normalizeMsgPub({ kty: "EC", crv: "P-256", x: "a", y: "b" }), null);

const resolvedSelf = resolveRecipientMsgPub(bobPub, { isSelf: true, identityPub: alicePub });
assert.equal(resolvedSelf.ecdh.x, alicePub.ecdh.x);
assert.equal(resolvedSelf.mlkem, alicePub.mlkem);
const resolvedOther = resolveRecipientMsgPub(bobPub, { isSelf: false, identityPub: alicePub });
assert.equal(resolvedOther.ecdh.x, bobPub.ecdh.x);

const staleSelf = await encryptSealedEnvelope(
  plain,
  [{ email: "alice@example.com", msgPub: bobPub }],
  "alice@example.com",
);
assert.equal(await decryptMessage(staleSelf, null, "alice@example.com"), DECRYPT_MISMATCH);

const liveSelf = await encryptSealedEnvelope(
  plain,
  [{ email: "alice@example.com", msgPub: resolveRecipientMsgPub(bobPub, { isSelf: true, identityPub: alicePub }) }],
  "alice@example.com",
);
assert.equal(await decryptMessage(liveSelf, null, "alice@example.com"), plain);

console.log("ok: hybrid crypto round-trip");
