/**
 * Approved-member goal set/achieved summaries for the admin Details modal.
 */
import assert from "node:assert/strict";
import {
    buildMemberGoalDetails,
    filterMemberGoalItems,
    getDirectoryUsers,
    isApprovedMember,
    listApprovedMembers,
    summarizeMemberGoals,
} from "../app/(portal)/goals/goalsHelpers.js";

const resolveEmail = (record) => (record.email || "").trim().toLowerCase();

assert.equal(isApprovedMember({ email: "a@x.com", approvedStatus: "approved" }, ["a@x.com"]), true);
assert.equal(isApprovedMember({ email: "a@x.com", approvedStatus: "rejected" }, ["a@x.com"]), false);
assert.equal(isApprovedMember({ email: "a@x.com", approvedStatus: "pending" }, ["a@x.com"]), false);
assert.equal(isApprovedMember({ email: "b@x.com", approvedStatus: "approved" }, ["a@x.com"]), false);
assert.equal(isApprovedMember({ email: "a@x.com" }, ["a@x.com"]), true);
assert.equal(isApprovedMember({ name: "No Email", approvedStatus: "approved" }, []), false);

const members = listApprovedMembers([
    { email: "zoe@x.com", name: "Zoe", approvedStatus: "approved" },
    { email: "ann@x.com", name: "Ann", approvedStatus: "approved" },
    { email: "skip@x.com", name: "Skip", approvedStatus: "pending" },
], ["zoe@x.com", "ann@x.com", "skip@x.com"]);
assert.deepEqual(members.map((m) => m.email), ["ann@x.com", "zoe@x.com"]);

const records = [
    {
        email: "ann@x.com",
        type: "weekly",
        scope: "personal",
        goals: [{ text: "one", done: true }, { text: "two", done: false }],
    },
    {
        email: "ann@x.com",
        type: "annual",
        scope: "personal",
        goals: [{ text: "year", done: true }],
    },
    {
        email: "zoe@x.com",
        type: "daily",
        scope: "personal",
        goals: [{ text: "day", done: false }],
    },
    {
        email: "ann@x.com",
        type: "weekly",
        scope: "global",
        goals: [{ text: "team", done: true }],
    },
    {
        email: "ann@x.com",
        pendingId: "p1",
        type: "weekly",
        scope: "personal",
        goals: [{ text: "pending", done: false }],
    },
];

const ann = summarizeMemberGoals(records, "ann@x.com", resolveEmail);
assert.equal(ann.set, 3);
assert.equal(ann.achieved, 2);
assert.equal(ann.byHorizon.weekly.set, 2);
assert.equal(ann.byHorizon.weekly.achieved, 1);
assert.equal(ann.byHorizon.annual.set, 1);
assert.equal(ann.byHorizon.annual.achieved, 1);
assert.equal(ann.items.length, 3);
assert.deepEqual(ann.items.map((item) => item.text).sort(), ["one", "two", "year"]);
assert.equal(ann.items.filter((item) => item.done).length, 2);
assert.equal(ann.items.some((item) => item.text === "team" || item.text === "pending"), false);

const details = buildMemberGoalDetails(
    [
        { email: "ann@x.com", name: "Ann Lee", approvedStatus: "approved" },
        { email: "zoe@x.com", name: "Zoe", approvedStatus: "approved" },
    ],
    ["ann@x.com", "zoe@x.com"],
    records,
    resolveEmail,
);
assert.equal(details.length, 2);
assert.equal(details[0].email, "ann@x.com");
assert.equal(details[0].name, "Ann Lee");
assert.equal(details[0].set, 3);
assert.equal(details[0].achieved, 2);
assert.equal(details[1].set, 1);
assert.equal(details[1].achieved, 0);

assert.equal(filterMemberGoalItems(ann.items, "all").length, 3);
assert.deepEqual(filterMemberGoalItems(ann.items, "completed").map((item) => item.text).sort(), ["one", "year"]);
assert.deepEqual(filterMemberGoalItems(ann.items, "open").map((item) => item.text), ["two"]);
assert.deepEqual(filterMemberGoalItems(null, "completed"), []);

const directory = getDirectoryUsers([
    { email: "ann@x.com", name: "Ann", approvedStatus: "approved" },
    { email: "wait@x.com", name: "Wait", approvedStatus: "pending" },
    { email: "no@x.com", name: "No", approvedStatus: "rejected" },
    { email: "out@x.com", name: "Out", approvedStatus: "approved" },
    { email: "skip@x.com", name: "Skip" },
], ["ann@x.com", "wait@x.com", "no@x.com", "skip@x.com"]);
assert.deepEqual(directory.map((m) => m.email), ["ann@x.com", "skip@x.com"]);
console.log("ok: directory dropdowns exclude pending, rejected, and off-list profiles");

console.log("ok — member goal details summaries");
