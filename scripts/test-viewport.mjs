import assert from "node:assert/strict";
import {
    MOBILE_HOME_PATH,
    MOBILE_MAX_WIDTH,
    MESSAGES_NARROW_MAX_WIDTH,
    consumeStayOnDashboard,
    isMessagesNarrowViewport,
    isMobileViewport,
    isViewportAtMost,
    markStayOnDashboard,
} from "../lib/viewport.js";

assert.equal(MOBILE_HOME_PATH, "/messages/");
assert.equal(MOBILE_MAX_WIDTH, 768);
assert.equal(MESSAGES_NARROW_MAX_WIDTH, 780);

// Node has no matchMedia — viewport helpers must stay false, not throw.
assert.equal(isViewportAtMost(768), false);
assert.equal(isMobileViewport(), false);
assert.equal(isMessagesNarrowViewport(), false);

const store = new Map();
globalThis.sessionStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: (key) => { store.delete(key); },
};

markStayOnDashboard();
assert.equal(consumeStayOnDashboard(), true);
assert.equal(consumeStayOnDashboard(), false);

console.log("viewport helpers ok");
