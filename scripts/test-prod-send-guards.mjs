/**
 * Locks the production send failure modes from 2026-09-11:
 * unused CSS preloads (dock prefetch of every module), Font Awesome CDN CORS,
 * and EmailJS/notification work blocking the messages PUT.
 * Usage: node scripts/test-prod-send-guards.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dock = readFileSync(new URL("../components/Dock.js", import.meta.url), "utf8");
assert.equal(dock.includes("router.prefetch"), false, "dock must not prefetch every module CSS chunk");
assert.match(dock, /prefetch=\{false\}/, "dock links must opt out of Next.js hover prefetch");

const layout = readFileSync(new URL("../app/layout.js", import.meta.url), "utf8");
assert.equal(
  layout.includes("cdnjs.cloudflare.com"),
  false,
  "Font Awesome must not load from cdnjs (Firefox CORS on webfonts)",
);
assert.match(layout, /@fortawesome\/fontawesome-free/, "Font Awesome must be same-origin via the npm package");

const dispatch = readFileSync(new URL("../lib/server/notifications/dispatch.js", import.meta.url), "utf8");
assert.match(
  dispatch,
  /scheduleAfterResponse/,
  "collection notifications must run after the HTTP response is sent",
);

const afterResponse = readFileSync(new URL("../lib/server/afterResponse.js", import.meta.url), "utf8");
assert.equal(
  afterResponse.includes('from "next/server"') || afterResponse.includes("from 'next/server'"),
  false,
  "must not use Next after() — it has blocked API responses",
);
assert.match(afterResponse, /setImmediate/, "local detach must use setImmediate, not void-run on the request");
assert.match(afterResponse, /waitUntil/, "Vercel must use waitUntil so the isolate can finish email after the response");

const withApi = readFileSync(new URL("../lib/server/withApi.js", import.meta.url), "utf8");
assert.match(withApi, /scheduleAfterResponse\(\(\) => logApiRequest/, "API logs must not delay the messages response");

const email = readFileSync(new URL("../lib/server/notifications/email.js", import.meta.url), "utf8");
assert.match(email, /emailJsRequestInit/, "EmailJS fetch must use the timed-out helper");
assert.match(email, /getEmailPortalUrl/, "Open Portal must use the canonical production portal helper");
assert.match(email, /emailPortalUrlForPath/, "secure notices must deep-link Open Portal via path join");
assert.equal(
  /process\.env\.NEXT_PUBLIC_PORTAL_URL \|\| process\.env\.APP_URL/.test(email),
  false,
  "must not pass localhost APP_URL straight into portal_url",
);

const put = readFileSync(new URL("../lib/dataApi.js", import.meta.url), "utf8");
assert.match(put, /DATA_PUT_TIMEOUT_MS/, "collection PUT must not wait forever");
assert.match(put, /httpErrorDetail/, "failed PUTs must not throw a blank DataApiError");
assert.match(put, /merge:\s*true/, "message send must POST a merge body, not rewrite the collection");

const portalApi = readFileSync(new URL("../lib/portalApi.js", import.meta.url), "utf8");
assert.match(portalApi, /messageUpsertsAndDeletes/, "save(messages) must diff instead of always PUT");
assert.match(portalApi, /mergeCollection/, "send path must call mergeCollection");

const dataRoute = readFileSync(new URL("../app/api/data/[collection]/route.js", import.meta.url), "utf8");
assert.match(dataRoute, /mergeCollectionItemsAtomic/, "POST merge must upsert rows without a full replace");
assert.match(dataRoute, /channelsForMessageItems/, "send must not list every channel row");
assert.equal(
  /export const POST = PUT/.test(dataRoute),
  false,
  "POST must not alias PUT (that rewrote every message on send)",
);

const messagesClient = readFileSync(
  new URL("../app/(portal)/messages/MessagesClient.js", import.meta.url),
  "utf8",
);
assert.match(
  messagesClient,
  /void loadMessages\(\)/,
  "successful send must clear the spinner before post-save hydrate finishes",
);
assert.equal(
  /await loadMessages\(\)/.test(messagesClient.split("const saveMessages")[1]?.split("const q =")[0] || ""),
  false,
  "saveMessages must not await loadMessages",
);

console.log("test-prod-send-guards: ok");
