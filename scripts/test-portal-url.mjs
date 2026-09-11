/**
 * Email Open Portal must never point at localhost, GitHub Pages, or a preview host.
 * Usage: node --import ./scripts/alias-loader.mjs scripts/test-portal-url.mjs
 */
import assert from "node:assert/strict";
import { messagesRoomLinkPath } from "../lib/server/notifications/links.js";
import {
  CANONICAL_PRODUCTION_PORTAL_URL,
  emailPortalUrlForPath,
  getEmailJsOrigin,
  getEmailPortalUrl,
  isUnusableEmailPortalUrl,
  normalizePortalHref,
} from "../lib/server/portalPublicUrl.js";

const canonical = `${CANONICAL_PRODUCTION_PORTAL_URL.replace(/\/+$/, "")}/`;

assert.equal(
  normalizePortalHref("https://hackstreetboysltd-internal-app.vercel.app/Internal-App"),
  canonical,
);
assert.equal(isUnusableEmailPortalUrl("http://localhost:3000/Internal-App"), true);
assert.equal(isUnusableEmailPortalUrl("https://kakaiking.github.io/Internal-App/"), true);
assert.equal(
  isUnusableEmailPortalUrl("https://internal-app-git-feat-hackstreetboys.vercel.app/Internal-App"),
  true,
);
assert.equal(
  isUnusableEmailPortalUrl("https://hackstreetboysltd-internal-app.vercel.app/Internal-App"),
  false,
);

assert.equal(
  getEmailPortalUrl({
    APP_URL: "http://localhost:3000/Internal-App",
    NEXT_PUBLIC_PORTAL_URL: "https://kakaiking.github.io/Internal-App/",
  }),
  canonical,
  "localhost + GitHub Pages must fall through to production Vercel",
);

assert.equal(
  getEmailPortalUrl({
    NEXT_PUBLIC_PORTAL_URL: "https://internal-app-abc123.vercel.app/Internal-App",
    APP_URL: "http://localhost:3000/Internal-App",
  }),
  canonical,
  "Vercel preview hosts must not be used in mail",
);

assert.equal(
  getEmailPortalUrl({
    PRODUCTION_PORTAL_URL: "https://hackstreetboysltd-internal-app.vercel.app/Internal-App",
    APP_URL: "http://localhost:3000/Internal-App",
  }),
  canonical,
);

assert.equal(
  getEmailJsOrigin({
    APP_URL: "http://localhost:3000/Internal-App",
  }),
  "https://hackstreetboysltd-internal-app.vercel.app",
);

assert.equal(
  getEmailJsOrigin({
    EMAILJS_ORIGIN: "https://hackstreetboysltd-internal-app.vercel.app",
    APP_URL: "http://localhost:3000/Internal-App",
  }),
  "https://hackstreetboysltd-internal-app.vercel.app",
);

assert.equal(messagesRoomLinkPath("eng"), "/messages/?room=eng");
assert.equal(
  messagesRoomLinkPath("dm-alice_40example.com--bob_40example.com"),
  "/messages/?room=dm-alice_40example.com--bob_40example.com",
);
assert.equal(messagesRoomLinkPath("../x"), "/messages/");
assert.equal(messagesRoomLinkPath(""), "/messages/");

assert.equal(
  emailPortalUrlForPath("/messages/?room=eng", {
    PRODUCTION_PORTAL_URL: "https://hackstreetboysltd-internal-app.vercel.app/Internal-App",
  }),
  "https://hackstreetboysltd-internal-app.vercel.app/Internal-App/messages/?room=eng",
);

console.log("test-portal-url: ok");
