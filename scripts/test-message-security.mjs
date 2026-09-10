/**
 * Item-route + profile msgPub + read redaction regressions (C1/C2, H3, H4/H5/M1, M3).
 * Usage: node --import ./scripts/alias-loader.mjs scripts/test-message-security.mjs
 */
import assert from "node:assert/strict";
import {
  actorOwnsMessageRecord,
  finalizeMessageSavePayload,
} from "@/lib/messageSave.js";
import { authorizeCollectionSave } from "@/lib/server/authorize.js";
import { filterAndRedactMessagesForActor, redactMessageWrapsForActor } from "@/lib/messageRead.js";
import { filterMessageItemsForActor } from "@/lib/channels.js";
import { isSafeHref } from "../app/(portal)/apps/html.js";

const alice = { name: "Alice", email: "alice@example.com", roles: [] };
const bob = { name: "Bob", email: "bob@example.com", roles: [] };
const eve = { name: "Eve", email: "eve@example.com", roles: [] };

const channels = [
  {
    id: "eng",
    name: "Eng",
    memberEmails: ["alice@example.com", "bob@example.com"],
    kind: "group",
  },
  {
    id: "dm-alice_at_example.com-bob_at_example.com",
    name: "Alice / Bob",
    memberEmails: ["alice@example.com", "bob@example.com"],
    kind: "dm",
  },
];

const aliceWrap = {
  type: "hybrid",
  email: "alice@example.com",
  iv: "a",
  key: "b",
  salt: "c",
  kemCt: "d",
  ephPub: { kty: "EC" },
};
const bobWrap = { ...aliceWrap, email: "bob@example.com" };
const eveWrap = { ...aliceWrap, email: "eve@example.com" };

const msgInEng = {
  id: "m-eng",
  author: "Alice",
  email: "alice@example.com",
  channel: "eng",
  enc: 5,
  cipher: "c1",
  iv: "i1",
  to: ["alice@example.com", "bob@example.com"],
  wrappedKeys: [aliceWrap, bobWrap],
};

const msgSecret = {
  id: "m-secret",
  author: "Bob",
  email: "bob@example.com",
  channel: "eng",
  enc: 5,
  cipher: "c2",
  iv: "i2",
  to: ["alice@example.com", "bob@example.com"],
  wrappedKeys: [aliceWrap, bobWrap],
};

// --- C1/C2 item-route ownership gates (pure helpers the route uses) ---
assert.equal(actorOwnsMessageRecord(msgInEng, bob), false);
assert.equal(actorOwnsMessageRecord(msgInEng, alice), true);

const patchForeign = finalizeMessageSavePayload(
  [msgInEng, msgSecret],
  [{ ...msgInEng, cipher: "hacked-by-bob" }, msgSecret],
  bob,
  { channels },
);
assert.equal(patchForeign.ok, true);
assert.equal(
  patchForeign.body.find((r) => r.id === "m-eng").cipher,
  "c1",
  "foreign PATCH body is pinned — authorizedNext wins (C2)",
);

const deleteForeign = finalizeMessageSavePayload(
  [msgInEng, msgSecret],
  [msgSecret],
  bob,
  { channels },
);
assert.equal(deleteForeign.ok, true);
assert.ok(
  deleteForeign.body.some((r) => r.id === "m-eng"),
  "foreign DELETE-by-omit restores row → route must 403 (C1)",
);

// --- H3: profile / msgPub ---
const bobProfile = {
  id: "bob@example.com",
  email: "bob@example.com",
  name: "Bob",
  msgPub: { ecdh: { kty: "EC", crv: "P-256", x: "1", y: "2" }, mlkem: "bob-kem" },
};
const eveProfile = {
  id: "eve@example.com",
  email: "eve@example.com",
  name: "Eve",
  msgPub: { ecdh: { kty: "EC", crv: "P-256", x: "3", y: "4" }, mlkem: "eve-kem" },
};

const eveStealsBobPub = authorizeCollectionSave(
  "profile",
  [bobProfile, eveProfile],
  [
    {
      ...bobProfile,
      msgPub: { ecdh: { kty: "EC", crv: "P-256", x: "evil", y: "evil" }, mlkem: "stolen" },
    },
    eveProfile,
  ],
  eve,
);
assert.equal(eveStealsBobPub.ok, true);
assert.equal(
  eveStealsBobPub.body.find((p) => p.email === "bob@example.com").msgPub.mlkem,
  "bob-kem",
  "Eve cannot mutate Bob msgPub on full save",
);

const eveCreatesBob = authorizeCollectionSave(
  "profile",
  [eveProfile],
  [
    eveProfile,
    {
      id: "bob@example.com",
      email: "bob@example.com",
      msgPub: { mlkem: "fake" },
    },
  ],
  eve,
);
assert.equal(eveCreatesBob.ok, false, "Eve cannot create Bob profile row");
assert.equal(eveCreatesBob.status, 403);

const eveOwnOk = authorizeCollectionSave(
  "profile",
  [bobProfile, eveProfile],
  [
    bobProfile,
    { ...eveProfile, msgPub: { ecdh: { kty: "EC", crv: "P-256", x: "9", y: "9" }, mlkem: "eve-new" } },
  ],
  eve,
);
assert.equal(eveOwnOk.ok, true);
assert.equal(eveOwnOk.body.find((p) => p.email === "eve@example.com").msgPub.mlkem, "eve-new");

// --- H4/H5/M1: membership + wrap redaction ---
const visibleToEve = filterMessageItemsForActor([msgInEng, msgSecret], eve, channels);
assert.equal(visibleToEve.length, 0, "non-member sees no messages (GET-by-id → 404)");

const visibleToAlice = filterAndRedactMessagesForActor([msgInEng, msgSecret], alice, channels);
assert.equal(visibleToAlice.length, 2);
for (const m of visibleToAlice) {
  assert.ok(Array.isArray(m.wrappedKeys));
  assert.ok(
    m.wrappedKeys.every((w) => w.email === "alice@example.com"),
    "listed wraps contain only actor email",
  );
  assert.equal(m.wrappedKeys.length, 1);
}

const redacted = redactMessageWrapsForActor([msgInEng], bob)[0];
assert.deepEqual(
  redacted.wrappedKeys.map((w) => w.email),
  ["bob@example.com"],
);

// Manifest-style id filter
const readableIds = new Set(
  filterMessageItemsForActor([msgInEng, msgSecret], eve, channels).map((m) => String(m.id)),
);
assert.equal(readableIds.has("m-eng"), false, "manifest omits foreign-room ids for non-members");

const aliceIds = new Set(
  filterMessageItemsForActor([msgInEng, msgSecret], alice, channels).map((m) => String(m.id)),
);
assert.equal(aliceIds.has("m-eng"), true);
assert.equal(aliceIds.has("m-secret"), true);

// --- M3: href allowlist ---
assert.equal(isSafeHref("https://example.com/x"), true);
assert.equal(isSafeHref("http://example.com"), true);
assert.equal(isSafeHref("mailto:a@b.com"), true);
assert.equal(isSafeHref("/relative/path"), true);
assert.equal(isSafeHref("#section"), true);
assert.equal(isSafeHref("javascript:alert(1)"), false);
assert.equal(isSafeHref("data:text/html,hi"), false);
assert.equal(isSafeHref("vbscript:msgbox(1)"), false);

console.log("ok: item-route ownership semantics (C1/C2)");
console.log("ok: profile msgPub owner lock (H3)");
console.log("ok: membership + wrap redaction + manifest id filter (H4/H5/M1)");
console.log("ok: href allowlist (M3)");
