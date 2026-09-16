/**
 * Goal save policy: omitting peer rows or stripping UI-only `title` must not 403;
 * real edits to another user's goals still 403. Unsigned actors cannot save.
 * Usage: node --import ./scripts/alias-loader.mjs scripts/test-goal-save.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { authorizeCollectionSave } from "@/lib/server/authorize.js";

const alice = { name: "Alice", email: "alice@example.com", roles: ["user"] };
const bob = { name: "Bob", email: "bob@example.com", roles: ["user"] };
const admin = { name: "Admin", email: "admin@example.com", roles: ["user", "admin"] };

const aliceGoal = {
  id: "g-alice",
  user: "Alice",
  email: "alice@example.com",
  goals: [{ text: "ship", done: false }],
  type: "weekly",
  scope: "personal",
};
const bobGoal = {
  id: "g-bob",
  user: "Bob",
  email: "bob@example.com",
  goals: [{ text: "secret", done: false }],
  type: "weekly",
  scope: "personal",
  title: "UI title",
};

const old = [aliceGoal, bobGoal];

const omitted = authorizeCollectionSave("goals", old, [{ ...aliceGoal, goals: [{ text: "ship", done: true }] }], alice, {
  users: [alice, bob],
});
assert.equal(omitted.ok, true, "omitting a peer goal must restore it, not 403");
assert.equal(omitted.body.length, 2);
assert.deepEqual(
  omitted.body.find((row) => String(row.id) === "g-bob"),
  bobGoal,
  "restored peer row must be server truth",
);
assert.equal(
  omitted.body.find((row) => String(row.id) === "g-alice").goals[0].done,
  true,
  "own progress update must apply",
);
console.log("ok: omitted peer goal is restored");

const titled = authorizeCollectionSave(
  "goals",
  old,
  [
    { ...aliceGoal },
    { ...bobGoal, title: undefined },
  ].map(({ title, ...rest }) => rest),
  alice,
  { users: [alice, bob] },
);
assert.equal(titled.ok, true, "stripTitles on a peer row must not 403");
assert.equal(
  titled.body.find((row) => String(row.id) === "g-bob").title,
  "UI title",
  "peer title must stay pinned",
);
console.log("ok: stripTitles on peer goals is ignored");

const hacked = authorizeCollectionSave(
  "goals",
  old,
  [aliceGoal, { ...bobGoal, goals: [{ text: "hacked", done: true }] }],
  alice,
  { users: [alice, bob] },
);
assert.equal(hacked.ok, false);
assert.equal(hacked.status, 403);
console.log("ok: real peer-goal mutation is still 403");

const unsigned = authorizeCollectionSave("goals", old, [aliceGoal], { name: "A Team Member", email: "" }, {
  users: [alice, bob],
});
assert.equal(unsigned.ok, false);
assert.equal(unsigned.status, 401);
console.log("ok: signed-out actor cannot save goals");

const adminReplace = authorizeCollectionSave(
  "goals",
  old,
  [{ ...aliceGoal, goals: [{ text: "assigned", done: false }] }],
  admin,
  { adminView: true, users: [alice, bob] },
);
assert.equal(adminReplace.ok, true);
assert.equal(adminReplace.body.length, 1);
console.log("ok: admin view can replace the goals collection");

const portalApi = readFileSync(new URL("../lib/portalApi.js", import.meta.url), "utf8");
assert.match(portalApi, /mergeCollection\("goals"/, "goal writes must merge changed rows, not PUT the table");
assert.match(portalApi, /deleteCollectionItem\("goals"/, "goal deletes must hit the per-id route");
assert.match(portalApi, /canWriteGoal/, "goal merge payload must only include rows the actor can write");

const dataApi = readFileSync(new URL("../lib/dataApi.js", import.meta.url), "utf8");
assert.match(dataApi, /deleteCollectionItem/, "dataApi must expose per-id DELETE");
assert.match(dataApi, /"goals"/, "goal merge/delete payloads must not seed a partial sync cache");

const goalsClient = readFileSync(new URL("../app/(portal)/goals/GoalsClient.js", import.meta.url), "utf8");
assert.match(goalsClient, /waitForSessionReady/, "goal persist must wait for a real session");

console.log("ok: goal save regressions");
