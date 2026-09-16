import assert from "node:assert/strict";

const {
  assigneeGoalEmailCopy,
  goalReminderEmailCopy,
  extractGoalTexts,
  formatGoalsDetailText,
  firstNamePossessive,
  reassignedGoalSubject,
} = await import(new URL("../lib/server/notifications/emailCopy.js", import.meta.url));

assert.equal(firstNamePossessive("BUNYASI PHIL KAKAI"), "Bunyasi's");
assert.equal(firstNamePossessive("KakaiK1ng"), "KakaiK1ng's");
assert.equal(firstNamePossessive("ryan mwiti"), "Ryan's");
assert.equal(reassignedGoalSubject("BUNYASI PHIL KAKAI", false), "You have been re-assigned Bunyasi's goal");
assert.equal(reassignedGoalSubject("BUNYASI PHIL KAKAI", true), "You have been re-assigned Bunyasi's goals");
assert.equal(formatGoalsDetailText(["Ship Q3", "Hire intern"]), "• Ship Q3\n• Hire intern");

const long = "x".repeat(250);
const clipped = formatGoalsDetailText([long]);
assert.equal(clipped.length, 200);
assert.ok(clipped.endsWith("..."));
assert.equal(clipped, `${"x".repeat(197)}...`);

const assigned = assigneeGoalEmailCopy({
  actorName: "KakaiK1ng",
  action: "assigned",
  goalItems: [{ text: "test" }],
  timestamp: "now",
  portalUrl: "https://example.com",
});

assert.equal(assigned.headline, "");
assert.equal(assigned.detail_text, "test");
assert.equal(assigned.eyebrow, "");
assert.equal(assigned.subject, "You have been assigned a goal");

const reassigned = assigneeGoalEmailCopy({
  actorName: "KakaiK1ng",
  action: "reassigned",
  previousOwnerName: "BUNYASI PHIL KAKAI",
  goalItems: [{ text: "Host @app:1787" }],
  apps: [{ id: "1787", name: "JANELL HEALTH" }],
  timestamp: "now",
  portalUrl: "https://example.com",
});
assert.equal(reassigned.subject, "You have been re-assigned Bunyasi's goal");
assert.equal(reassigned.detail_text, "Host @JANELL HEALTH");
assert.doesNotMatch(reassigned.detail_text, /@app:/);

const mentioned = extractGoalTexts(
  [{ text: "Host @app:1787650528189" }],
  [{ id: 1787650528189, name: "JANELL HEALTH" }],
);
assert.deepEqual(mentioned, ["Host @JANELL HEALTH"]);
assert.equal(assigned.show_goal_list, undefined);
assert.equal(assigned.goals, undefined);
assert.equal(assigned.action, undefined);
assert.equal(assigned.item_name, undefined);

const many = assigneeGoalEmailCopy({
  actorName: "KakaiK1ng",
  goalItems: [{ text: "Ship Q3" }, { text: "Hire intern" }],
  timestamp: "now",
  portalUrl: "https://example.com",
});
assert.equal(many.headline, "");
assert.equal(many.detail_text, "• Ship Q3\n• Hire intern");
assert.equal(many.subject, "You have been assigned some goals");
assert.equal(many.eyebrow, "");

const longAssigned = assigneeGoalEmailCopy({
  actorName: "KakaiK1ng",
  goalItems: [{ text: long }],
  timestamp: "now",
  portalUrl: "https://example.com",
});
assert.ok(longAssigned.detail_text.endsWith("..."));
assert.equal(longAssigned.detail_text.length, 200);

const reminder = goalReminderEmailCopy({
  actorName: "KakaiK1ng",
  goalText: "Host @app:1787",
  customMessage: "jooh",
  apps: [{ id: "1787", name: "JANELL HEALTH" }],
  timestamp: "now",
  portalUrl: "https://example.com",
});
assert.equal(reminder.headline, "KakaiK1ng sent you a reminder about this goal.");
assert.equal(reminder.detail_text, "Host @JANELL HEALTH");
assert.equal(reminder.note, "jooh");

assert.deepEqual(extractGoalTexts([{ text: "  <b>Hi</b>  " }]), ["Hi"]);

const {
  SECURE_CHANNEL_ADDED,
  SECURE_MESSAGE_RECEIVED,
  secureNoticeEmailCopy,
} = await import(new URL("../lib/server/notifications/emailCopy.js", import.meta.url));

const notice = secureNoticeEmailCopy({
  subject: SECURE_MESSAGE_RECEIVED,
  timestamp: "now",
  portalUrl: "https://example.com",
});
assert.equal(notice.subject, SECURE_MESSAGE_RECEIVED);
assert.equal(notice.headline, "");
assert.equal(notice.detail_text, "");
assert.equal(SECURE_CHANNEL_ADDED, "You have been added to this secure channel. Check it out");

const { buildCollectionIntents } = await import(new URL("../lib/server/notifications/rules.js", import.meta.url));
const alice = { name: "Alice", email: "alice@example.com" };
const bob = { name: "Bob", email: "bob@example.com" };
const oldGoal = {
  id: "g1",
  user: "Alice",
  email: "alice@example.com",
  assignedByAdmin: false,
  type: "weekly",
  periodId: "2026-W38",
  goals: [{ text: "Host @app:1787" }],
};
const movedGoal = {
  ...oldGoal,
  user: "Bob",
  email: "bob@example.com",
  assignedByAdmin: true,
};
const moveIntents = buildCollectionIntents("goals", [oldGoal], [movedGoal], {
  profiles: [alice, bob],
  apps: [{ id: "1787", name: "JANELL HEALTH" }],
});
const assignee = moveIntents.find((intent) => intent.kind === "assignee");
assert.equal(assignee.assigneeAction, "reassigned");
assert.equal(assignee.action, "reassigned");
assert.equal(assignee.previousOwnerName, "Alice");
assert.equal(assignee.itemName, "Host @JANELL HEALTH");

console.log("email copy assertions passed");
