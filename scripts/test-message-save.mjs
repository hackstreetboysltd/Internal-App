/**
 * Message save / write policy regression (C1/C2 helpers, H1/H2).
 * Usage: node --import ./scripts/alias-loader.mjs scripts/test-message-save.mjs
 */
import assert from "node:assert/strict";
import {
  mergeMessageSavePayload,
  actorOwnsMessageRecord,
  finalizeMessageSavePayload,
  messageUpsertsAndDeletes,
} from "@/lib/messageSave.js";
import { authorizeCollectionSave } from "@/lib/server/authorize.js";
import { effectiveSyncSince } from "@/lib/server/collectionsDb.js";
import { isEnvelopeMessage, isCipherRecord } from "../app/(portal)/messages/crypto.js";

const aliceWrap = { type: "hybrid", email: "alice@example.com", iv: "a", key: "b", salt: "c", kemCt: "d", ephPub: { kty: "EC" } };
const bobWrap = { type: "hybrid", email: "bob@example.com", iv: "a", key: "b", salt: "c", kemCt: "d", ephPub: { kty: "EC" } };

const privateChannel = {
  id: "ops-private",
  name: "Ops",
  memberEmails: ["alice@example.com"],
  kind: "group",
};

const foreign = {
  id: "1789051200506",
  author: "Other Person",
  email: "other@example.com",
  enc: 5,
  cipher: "xx",
  iv: "yy",
  channel: "direct",
  to: ["alice@example.com", "bob@example.com"],
  wrappedKeys: [aliceWrap, bobWrap],
};

const mine = {
  id: "mine-1",
  author: "BUNYASI PHIL KAKAI",
  email: "bunyasi@example.com",
  enc: 5,
  cipher: "zz",
  iv: "ww",
  channel: "direct",
  to: ["bunyasi@example.com"],
  wrappedKeys: [{ ...aliceWrap, email: "bunyasi@example.com" }],
};

const oldCollection = [foreign, mine];
const session = { name: "Different Display Name", email: "bunyasi@example.com" };
const channels = [privateChannel];

const incoming = [
  {
    ...foreign,
    wrappedKeys: [],
  },
  {
    id: "new-1",
    author: "BUNYASI PHIL KAKAI",
    email: "bunyasi@example.com",
    enc: 5,
    cipher: "nn",
    iv: "ii",
    channel: "direct",
    to: ["bob@example.com"],
    wrappedKeys: [bobWrap],
  },
];

const omittedForeign = mergeMessageSavePayload(oldCollection, [incoming[1]], session);
assert.ok(
  omittedForeign.some((row) => String(row.id) === String(foreign.id)),
  "omitted foreign row must be restored",
);

const restored = mergeMessageSavePayload(oldCollection, incoming, session);
const restoredForeign = restored.find((row) => String(row.id) === String(foreign.id));
assert.equal(restoredForeign.wrappedKeys.length, 2);

const stillDeletedOwn = mergeMessageSavePayload(oldCollection, [foreign], session);
assert.equal(
  stillDeletedOwn.some((row) => String(row.id) === "mine-1"),
  false,
  "own row omitted on purpose must stay deleted",
);

assert.equal(isEnvelopeMessage({ enc: 5, cipher: "x", iv: "y", wrappedKeys: [] }), false);
assert.equal(isCipherRecord({ enc: 5, cipher: "x", iv: "y", wrappedKeys: [] }), true);

assert.equal(actorOwnsMessageRecord(mine, session), true, "email match owns the message");
assert.equal(actorOwnsMessageRecord(foreign, session), false, "foreign email is not owner");

// Name collision must not grant ownership (H2).
const sameNameForeign = { ...foreign, author: session.name, email: "intruder@example.com" };
assert.equal(
  actorOwnsMessageRecord(sameNameForeign, session),
  false,
  "matching display name alone is not ownership",
);

const editedMine = {
  ...mine,
  cipher: "edited-cipher",
  iv: "edited-iv",
  wrappedKeys: [
    { ...aliceWrap, email: "bunyasi@example.com" },
    { ...bobWrap, email: "bob@example.com" },
  ],
  to: ["bunyasi@example.com", "bob@example.com"],
};

const editSave = authorizeCollectionSave(
  "messages",
  oldCollection,
  [foreign, editedMine],
  session,
  { channels },
);
assert.equal(editSave.ok, true, "owner can edit own message when session name differs from author");
assert.equal(editSave.body.find((r) => r.id === "mine-1").cipher, "edited-cipher");
assert.equal(editSave.body.find((r) => r.id === foreign.id).cipher, "xx", "foreign cipher stays server truth");
const editStamp = editSave.body.find((r) => r.id === "mine-1").editedAt;
assert.ok(editStamp && Number.isFinite(Date.parse(editStamp)), "successful content edit stamps editedAt");

const sendWithMutatedForeign = authorizeCollectionSave(
  "messages",
  oldCollection,
  [
    { ...foreign, cipher: "mutated-by-client", channel: "dm-injected", wrappedKeys: [aliceWrap] },
    mine,
    {
      id: "new-send",
      author: session.name,
      email: session.email,
      enc: 5,
      cipher: "fresh",
      iv: "iv",
      channel: "direct",
      to: ["bob@example.com"],
      wrappedKeys: [bobWrap],
    },
  ],
  session,
  { channels },
);
assert.equal(sendWithMutatedForeign.ok, true, "send succeeds even if foreign rows were mutated client-side");
assert.equal(
  sendWithMutatedForeign.body.find((r) => r.id === foreign.id).cipher,
  "xx",
  "foreign row pinned to server snapshot on send",
);
assert.ok(sendWithMutatedForeign.body.some((r) => r.id === "new-send"), "new owned message is kept");
assert.equal(
  sendWithMutatedForeign.body.find((r) => r.id === "mine-1").editedAt,
  undefined,
  "unchanged owned rows are not marked edited when sending a new message",
);
assert.equal(
  sendWithMutatedForeign.body.find((r) => r.id === "new-send").editedAt,
  undefined,
  "new messages are not marked edited",
);

const stealSave = authorizeCollectionSave(
  "messages",
  oldCollection,
  [{ ...foreign, cipher: "stolen" }, mine],
  session,
  { channels },
);
assert.equal(stealSave.ok, true, "mutated foreign payload is accepted but changes are discarded");
assert.equal(stealSave.body.find((r) => r.id === foreign.id).cipher, "xx");

const finalized = finalizeMessageSavePayload(
  oldCollection,
  [{ ...foreign, cipher: "nope" }, editedMine],
  session,
  { channels },
);
assert.equal(finalized.ok, true);
assert.equal(finalized.body.find((r) => r.id === foreign.id).cipher, "xx");
assert.equal(finalized.body.find((r) => r.id === "mine-1").cipher, "edited-cipher");

// H1: inject into private channel → deny
const injectPrivate = finalizeMessageSavePayload(
  oldCollection,
  [
    ...oldCollection,
    {
      id: "inject-1",
      author: session.name,
      email: session.email,
      enc: 5,
      cipher: "sneak",
      iv: "iv",
      channel: "ops-private",
      to: ["alice@example.com"],
      wrappedKeys: [aliceWrap],
    },
  ],
  session,
  { channels },
);
assert.equal(injectPrivate.ok, false, "non-member cannot post to private channel");
assert.equal(injectPrivate.status, 403);

// H2: name-collision edit of foreign row stays pinned (cannot take over)
const nameCollisionEdit = finalizeMessageSavePayload(
  [sameNameForeign, mine],
  [{ ...sameNameForeign, author: session.name, email: session.email, cipher: "taken" }, mine],
  session,
  { channels },
);
assert.equal(nameCollisionEdit.ok, true);
assert.equal(
  nameCollisionEdit.body.find((r) => r.id === sameNameForeign.id).cipher,
  "xx",
  "name-collision foreign row remains server truth",
);
assert.equal(
  nameCollisionEdit.body.find((r) => r.id === sameNameForeign.id).email,
  "intruder@example.com",
);

// Create with spoofed email → stamped to session
const spoofCreate = finalizeMessageSavePayload(
  oldCollection,
  [
    ...oldCollection,
    {
      id: "spoof-1",
      author: "Victim",
      email: "victim@example.com",
      enc: 5,
      cipher: "c",
      iv: "i",
      channel: "direct",
      to: ["bob@example.com"],
      wrappedKeys: [bobWrap],
    },
  ],
  session,
  { channels },
);
assert.equal(spoofCreate.ok, true);
assert.equal(
  spoofCreate.body.find((r) => r.id === "spoof-1").email,
  "bunyasi@example.com",
  "create stamps session email",
);
assert.equal(
  spoofCreate.body.find((r) => r.id === "spoof-1").editedAt,
  undefined,
  "new messages are not marked edited",
);

const alreadyEdited = { ...mine, editedAt: "2026-01-01T00:00:00.000Z" };
const resaveEdited = finalizeMessageSavePayload(
  [foreign, alreadyEdited],
  [foreign, { ...alreadyEdited, editedAt: "2099-01-01T00:00:00.000Z" }],
  session,
  { channels },
);
assert.equal(resaveEdited.ok, true);
assert.equal(
  resaveEdited.body.find((r) => r.id === "mine-1").editedAt,
  "2026-01-01T00:00:00.000Z",
  "unchanged ciphertext keeps the original editedAt (client cannot spoof or clear it)",
);

const spoofCreateEdited = finalizeMessageSavePayload(
  oldCollection,
  [
    ...oldCollection,
    {
      id: "spoof-edited",
      author: session.name,
      email: session.email,
      enc: 5,
      cipher: "c",
      iv: "i",
      channel: "direct",
      to: ["bob@example.com"],
      wrappedKeys: [bobWrap],
      editedAt: "2020-01-01T00:00:00.000Z",
    },
  ],
  session,
  { channels },
);
assert.equal(spoofCreateEdited.ok, true);
assert.equal(
  spoofCreateEdited.body.find((r) => r.id === "spoof-edited").editedAt,
  undefined,
  "create strips client-supplied editedAt",
);

// Item-route DELETE semantics: omitting foreign restores it → still present → 403 gate
const omitForeignFinalize = finalizeMessageSavePayload(
  oldCollection,
  [mine],
  session,
  { channels },
);
assert.equal(omitForeignFinalize.ok, true);
assert.ok(
  omitForeignFinalize.body.some((r) => String(r.id) === String(foreign.id)),
  "omit-foreign restore blocks delete-by-omission",
);

// Concurrent full-collection PUT: authorize MUST re-read under the lock. A stale
// snapshot (peer message not yet visible to this writer) soft-deletes the peer row.
const peerMsg = {
  id: "peer-just-arrived",
  author: "Other Person",
  email: "other@example.com",
  enc: 5,
  cipher: "peer-cipher",
  iv: "peer-iv",
  channel: "direct",
  to: ["bunyasi@example.com", "other@example.com"],
  wrappedKeys: [
    { ...aliceWrap, email: "bunyasi@example.com" },
    { ...bobWrap, email: "other@example.com" },
  ],
};
const myNew = {
  id: "my-concurrent-send",
  author: session.name,
  email: session.email,
  enc: 5,
  cipher: "mine-new",
  iv: "iv-new",
  channel: "direct",
  to: ["bob@example.com"],
  wrappedKeys: [bobWrap],
};
const staleSnapshot = [foreign, mine];
const againstStale = finalizeMessageSavePayload(staleSnapshot, [...staleSnapshot, myNew], session, {
  channels,
});
assert.equal(againstStale.ok, true);
assert.equal(
  againstStale.body.some((r) => String(r.id) === peerMsg.id),
  false,
  "stale snapshot cannot see the peer row — this is the lost-update failure mode",
);
const freshSnapshot = [foreign, mine, peerMsg];
const againstFresh = finalizeMessageSavePayload(freshSnapshot, [...staleSnapshot, myNew], session, {
  channels,
});
assert.equal(againstFresh.ok, true);
assert.ok(
  againstFresh.body.some((r) => String(r.id) === peerMsg.id),
  "re-read under lock restores the peer row the client omitted",
);
assert.ok(
  againstFresh.body.some((r) => String(r.id) === myNew.id),
  "own concurrent send is kept",
);

console.log("ok: message save merge preserves foreign rows and wraps");
console.log("ok: membership + email-only ownership + create stamp");
console.log("ok: message send/edit pins foreign rows and allows owned changes");
console.log("ok: concurrent save requires fresh locked snapshot to keep peer rows");

// HAR 2026-09-10 21:54: client polled since=21:33:21.806Z; DB rows sat at 18:43:02Z.
const harNow = Date.parse("2026-09-10T18:53:42.493Z");
assert.equal(
  effectiveSyncSince("2026-09-10T21:33:21.806Z", harNow),
  null,
  "future since cursor must force a full snapshot, not an empty delta",
);
assert.equal(effectiveSyncSince(null, harNow), null);
assert.equal(effectiveSyncSince("not-a-date", harNow), null);
const past = effectiveSyncSince("2026-09-10T18:33:21.806Z", harNow);
assert.ok(past instanceof Date);
assert.equal(past.toISOString(), "2026-09-10T18:33:21.806Z");
const near = effectiveSyncSince("2026-09-10T18:53:43.000Z", harNow);
assert.ok(near instanceof Date, "2s clock skew is still a usable cursor");
console.log("ok: future sync cursor is ignored (HAR empty-delta)");

const sendDiff = messageUpsertsAndDeletes(oldCollection, [...oldCollection, incoming[1]]);
assert.deepEqual(sendDiff.deletes, []);
assert.equal(sendDiff.upserts.length, 1);
assert.equal(String(sendDiff.upserts[0].id), "new-1");

const noopDiff = messageUpsertsAndDeletes(oldCollection, oldCollection);
assert.equal(noopDiff.upserts.length, 0);
assert.equal(noopDiff.deletes.length, 0);

const deleteDiff = messageUpsertsAndDeletes(oldCollection, [foreign]);
assert.deepEqual(deleteDiff.deletes, ["mine-1"]);
assert.equal(deleteDiff.upserts.length, 0);
console.log("ok: send diffs to a single upsert instead of a full replace");
