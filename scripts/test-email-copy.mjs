import assert from "node:assert/strict";

const {
  assigneeGoalEmailCopy,
  goalReminderEmailCopy,
  formatGoalsDetailHtml,
  extractGoalTexts,
} = await import(new URL("../lib/server/notifications/emailCopy.js", import.meta.url));

const assigned = assigneeGoalEmailCopy({
  actorName: "KakaiK1ng",
  action: "assigned",
  goalItems: [{ text: "test" }],
  timestamp: "now",
  portalUrl: "https://example.com",
});

assert.equal(assigned.headline, "KakaiK1ng assigned you a goal.");
assert.equal(assigned.detail_html, "test");
assert.equal(assigned.action, "");
assert.equal(assigned.item_name, "");
assert.match(assigned.subject, /assigned you a goal/);

const many = assigneeGoalEmailCopy({
  actorName: "KakaiK1ng",
  goalItems: [{ text: "Ship Q3" }, { text: "Hire intern" }],
  timestamp: "now",
  portalUrl: "https://example.com",
});
assert.equal(many.headline, "KakaiK1ng assigned you these goals.");
assert.match(many.detail_html, /<ul/);
assert.match(many.detail_html, /Ship Q3/);
assert.doesNotMatch(many.detail_html, /&quot;Ship Q3&quot;/);

const reminder = goalReminderEmailCopy({
  actorName: "KakaiK1ng",
  goalText: "test",
  customMessage: "jooh",
  timestamp: "now",
  portalUrl: "https://example.com",
});
assert.equal(reminder.headline, "KakaiK1ng sent you a reminder about this goal.");
assert.equal(reminder.detail_html, "test");
assert.equal(reminder.note, "jooh");
assert.equal(reminder.action, "");

assert.deepEqual(extractGoalTexts([{ text: "  <b>Hi</b>  " }]), ["Hi"]);
assert.equal(formatGoalsDetailHtml(["one"]), "one");

console.log("email copy assertions passed");
