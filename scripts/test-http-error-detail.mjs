/**
 * Firefox HTTP/2 leaves statusText empty — API errors must still name the failure.
 * Usage: node --import ./scripts/alias-loader.mjs scripts/test-http-error-detail.mjs
 */
import assert from "node:assert/strict";
import { httpErrorDetail, isAbortLikeError } from "../lib/httpErrorDetail.js";

assert.equal(httpErrorDetail(504, "", null), "The server timed out. Try again.");
assert.equal(httpErrorDetail(504, "", {}), "The server timed out. Try again.");
assert.equal(httpErrorDetail(500, "", { error: "" }), "HTTP 500");
assert.equal(httpErrorDetail(403, "", { error: "Permission Denied: no" }), "Permission Denied: no");
assert.equal(httpErrorDetail(429, "Too Many Requests", null), "Too Many Requests");
assert.equal(httpErrorDetail(0, "", null), "Request failed");
assert.equal(isAbortLikeError({ name: "TimeoutError" }), true);
assert.equal(isAbortLikeError({ name: "AbortError" }), true);
assert.equal(isAbortLikeError({ name: "TypeError" }), false);
assert.equal(isAbortLikeError(null), false);

console.log("test-http-error-detail: ok");
