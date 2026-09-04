import assert from "node:assert/strict";

const {
  assigneeGoalEmailCopy,
  goalReminderEmailCopy,
  extractGoalTexts,
  formatGoalsDetailText,
} = await import(new URL("../lib/server/notifications/emailCopy.js", import.meta.url));

assert.equal(formatGoalsDetailText(["Ship Q3"]), "Ship Q3");
assert.equal(formatGoalsDetailText(["Ship Q3", "Hire intern"]), "• Ship Q3\n• Hire intern");

const assigned = assigneeGoalEmailCopy({
  actorName: "KakaiK1ng",
  action: "assigned",
  goalItems: [{ text: "test" }],
  timestamp: "now",
  portalUrl: "https://example.com",
});

assert.equal(assigned.headline, "You have been assigned a goal.");
assert.equal(assigned.detail_text, "test");
assert.equal(assigned.eyebrow, "");
assert.equal(assigned.subject, "You have been assigned a goal");
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
assert.equal(many.headline, "You have been assigned some goals.");
assert.equal(many.detail_text, "• Ship Q3\n• Hire intern");
assert.equal(many.subject, "You have been assigned some goals");
assert.equal(many.eyebrow, "");

const reminder = goalReminderEmailCopy({
  actorName: "KakaiK1ng",
  goalText: "test",
  customMessage: "jooh",
  timestamp: "now",
  portalUrl: "https://example.com",
});
assert.equal(reminder.headline, "KakaiK1ng sent you a reminder about this goal.");
assert.equal(reminder.detail_text, "test");
assert.equal(reminder.note, "jooh");

assert.deepEqual(extractGoalTexts([{ text: "  <b>Hi</b>  " }]), ["Hi"]);

console.log("email copy assertions passed");
