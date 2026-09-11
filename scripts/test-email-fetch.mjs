/**
 * EmailJS calls must abort instead of hanging the serverless isolate.
 * Usage: node --import ./scripts/alias-loader.mjs scripts/test-email-fetch.mjs
 */
import assert from "node:assert/strict";
import {
  EMAILJS_SEND_URL,
  EMAIL_FETCH_TIMEOUT_MS,
  emailJsRequestInit,
} from "../lib/server/notifications/emailFetch.js";

assert.equal(EMAILJS_SEND_URL.startsWith("https://api.emailjs.com/"), true);
assert.ok(EMAIL_FETCH_TIMEOUT_MS <= 8_000);
assert.ok(EMAIL_FETCH_TIMEOUT_MS >= 1_000);

const init = emailJsRequestInit("https://example.com", "{}");
assert.equal(init.method, "POST");
assert.equal(init.headers.Origin, "https://example.com");
assert.ok(init.signal instanceof AbortSignal);
assert.equal(init.signal.aborted, false);

console.log("test-email-fetch: ok");
