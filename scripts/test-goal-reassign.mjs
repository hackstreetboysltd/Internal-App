/**
 * Admin reassign of a specific personal goal item.
 * Usage: node --import ./scripts/alias-loader.mjs scripts/test-goal-reassign.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyGoalReassignment, cloneRecords } from "../app/(portal)/goals/goalsHelpers.js";

const alice = { name: "Alice", email: "alice@example.com" };
const bob = { name: "Bob", email: "bob@example.com" };
const admin = { name: "Admin", email: "admin@example.com" };
const users = [alice, bob, admin];

const single = {
    id: "g-1",
    user: "Alice",
    email: "alice@example.com",
    scope: "personal",
    type: "weekly",
    periodId: "2026-W38",
    weekId: "2026-W38",
    goals: [{ text: "Host clinic", done: false }],
};

const moved = applyGoalReassignment(cloneRecords([single]), {
    recordId: "g-1",
    goalIndex: 0,
    toEmail: "bob@example.com",
    users,
    actor: admin,
});
assert.equal(moved.ok, true);
assert.equal(moved.records.length, 1);
assert.equal(moved.records[0].email, "bob@example.com");
assert.equal(moved.records[0].user, "Bob");
assert.equal(moved.records[0].assignedByAdmin, true);
assert.equal(moved.records[0].createdByEmail, "admin@example.com");
assert.equal(moved.records[0].goals[0].text, "Host clinic");
console.log("ok: single-item record changes owner in place");

const same = applyGoalReassignment(cloneRecords([single]), {
    recordId: "g-1",
    toEmail: "alice@example.com",
    users,
    actor: admin,
});
assert.equal(same.ok, false);
assert.match(same.error, /already assigned/);
console.log("ok: same-user reassign is rejected");

const bundled = {
    id: "g-2",
    user: "Alice",
    email: "alice@example.com",
    scope: "personal",
    type: "weekly",
    periodId: "2026-W38",
    weekId: "2026-W38",
    goals: [
        { text: "keep with alice", done: false },
        { text: "move to bob", done: true },
        { text: "also alice", done: false },
    ],
};
const split = applyGoalReassignment(cloneRecords([bundled]), {
    recordId: "g-2",
    goalIndex: 1,
    toEmail: "bob@example.com",
    users,
    actor: admin,
    nextId: () => "g-split",
});
assert.equal(split.ok, true);
assert.equal(split.records.length, 2);
assert.deepEqual(split.records[0].goals.map((g) => g.text), ["keep with alice", "also alice"]);
assert.equal(split.records[0].email, "alice@example.com");
const created = split.records.find((row) => String(row.id) === "g-split");
assert.ok(created);
assert.equal(created.email, "bob@example.com");
assert.equal(created.user, "Bob");
assert.equal(created.assignedByAdmin, true);
assert.equal(created.reassignedByAdmin, true);
assert.deepEqual(created.goals, [{ text: "move to bob", done: true }]);
assert.equal(created.type, "weekly");
assert.equal(created.periodId, "2026-W38");
console.log("ok: multi-item record splits only the selected goal");

const globalRow = {
    id: "g-global",
    scope: "global",
    email: "alice@example.com",
    goals: [{ text: "shared", done: false }],
};
const blocked = applyGoalReassignment(cloneRecords([globalRow]), {
    recordId: "g-global",
    toEmail: "bob@example.com",
    users,
    actor: admin,
});
assert.equal(blocked.ok, false);
assert.match(blocked.error, /personal/);
console.log("ok: global goals cannot be reassigned");

const missing = applyGoalReassignment(cloneRecords([single]), {
    recordId: "nope",
    toEmail: "bob@example.com",
    users,
    actor: admin,
});
assert.equal(missing.ok, false);
console.log("ok: missing record is rejected");

const client = readFileSync(new URL("../app/(portal)/goals/GoalsClient.js", import.meta.url), "utf8");
assert.match(client, /label:\s*"Reassign"/, "admin 3-dot menu must expose Reassign");
assert.match(client, /openReassign\(record\.id,\s*goalIndex\)/, "Reassign must target the selected goal row");
assert.match(client, /applyGoalReassignment/, "confirm path must use the shared reassignment helper");
assert.match(client, /directoryEmails\(directory\)/, "member pickers must use the active directory, not every profile");
console.log("ok: GoalsClient wires Reassign from the 3-dot menu");

console.log("test-goal-reassign: ok");
