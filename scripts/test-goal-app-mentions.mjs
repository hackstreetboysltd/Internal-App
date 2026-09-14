/**
 * Goal app mentions store app ids and always render the current name.
 */
import assert from "node:assert/strict";
import {
    displayGoalText,
    encodeAppMentions,
    formatGoalText,
    formatGoalTextForInput,
    goalTextMentionsApp,
    serializeGoalEditor,
} from "../app/(portal)/goals/goalsHelpers.js";

const apps = [
    { id: 1001, name: "AppHub" },
    { id: "abc-2", name: "Investor Pulse" },
];

const stored = encodeAppMentions("Ensure @AppHub has api logs", apps);
assert.equal(stored, "Ensure @app:1001 has api logs");
assert.equal(
    encodeAppMentions("Talk to @Investor Pulse owners", apps),
    "Talk to @app:abc-2 owners",
);
assert.equal(encodeAppMentions("already @app:1001 tagged", apps), "already @app:1001 tagged");

assert.equal(displayGoalText("Ensure @app:1001 has api logs", apps), "Ensure @AppHub has api logs");
assert.equal(
    displayGoalText("Ensure @app:1001 has api logs", [{ id: 1001, name: "Portal Hub" }]),
    "Ensure @Portal Hub has api logs",
);
assert.equal(displayGoalText("legacy @AppHub still works", apps), "legacy @AppHub still works");

const html = formatGoalText("Ensure @app:1001 checkout works", apps);
assert.match(html, /data-app-id="1001"/);
assert.match(html, /@AppHub/);
assert.doesNotMatch(html, /@app:1001/);

const renamed = formatGoalText("Ensure @app:1001 checkout works", [{ id: 1001, name: "Portal Hub" }]);
assert.match(renamed, /@Portal Hub/);
assert.doesNotMatch(renamed, /@AppHub/);

const inputHtml = formatGoalTextForInput("@app:abc-2", apps);
assert.match(inputHtml, /contenteditable="false"/);
assert.match(inputHtml, /data-app-id="abc-2"/);
assert.match(inputHtml, /@Investor Pulse/);

const legacyHtml = formatGoalText("Ensure @AppHub checkout works", apps);
assert.match(legacyHtml, /@AppHub/);

assert.equal(goalTextMentionsApp("Ensure @app:1001 checkout works", apps[0]), true);
assert.equal(goalTextMentionsApp("Ensure @app:abc-2 checkout works", apps[0]), false);
assert.equal(goalTextMentionsApp("Ensure @AppHub checkout works", apps[0]), true);
assert.equal(goalTextMentionsApp("Ensure @apphub checkout works", apps[0]), true);
assert.equal(goalTextMentionsApp("Ensure @app:1001 checkout works", { id: 1001, name: "Portal Hub" }), true);

const namedApp = { id: 9, name: "app" };
assert.equal(goalTextMentionsApp("ping @app please", namedApp), true);
assert.equal(goalTextMentionsApp("tagged @app:1001 already", namedApp), false);

function textNode(value) {
    return { nodeType: 3, nodeValue: value };
}
function element(tagName, attrs = {}, children = []) {
    return {
        nodeType: 1,
        tagName,
        getAttribute: (name) => (Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null),
        childNodes: children,
    };
}

const editor = element("div", {}, [
    textNode("Ensure "),
    element("span", { "data-app-id": "1001" }, [textNode("@AppHub")]),
    textNode(" has limits"),
]);
assert.equal(serializeGoalEditor(editor), "Ensure @app:1001 has limits");

console.log("test-goal-app-mentions: ok");
