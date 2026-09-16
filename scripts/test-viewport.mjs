import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
    MOBILE_MAX_WIDTH,
    MESSAGES_NARROW_MAX_WIDTH,
    isMessagesNarrowViewport,
    isMobileViewport,
    isViewportAtMost,
} from "../lib/viewport.js";

assert.equal(MOBILE_MAX_WIDTH, 768);
assert.equal(MESSAGES_NARROW_MAX_WIDTH, 780);

// Node has no matchMedia — viewport helpers must stay false, not throw.
assert.equal(isViewportAtMost(768), false);
assert.equal(isMobileViewport(), false);
assert.equal(isMessagesNarrowViewport(), false);

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const homePage = readFileSync(join(root, "app/page.js"), "utf8");
assert.match(homePage, /Dashboard/);
assert.doesNotMatch(homePage, /router\.replace/);
assert.doesNotMatch(homePage, /\/messages\//);

const login = readFileSync(join(root, "app/login/LoginClient.js"), "utf8");
assert.match(login, /function defaultReturnTo\(\) \{\s*return "\/";\s*\}/);

console.log("viewport helpers ok");
