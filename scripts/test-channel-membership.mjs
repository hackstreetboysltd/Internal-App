/**
 * Live check: members see Credentials in Messages tabs; outsiders do not.
 * Usage: DATABASE_URL=... node --import ./scripts/alias-loader.mjs scripts/test-channel-membership.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readCollection, getCollectionDelta } from "@/lib/server/collectionsDb.js";
import { filterChannelsForActor, messageChannelTabs } from "@/lib/channels.js";

function loadEnvLocal() {
  const path = fileURLToPath(new URL("../.env.local", import.meta.url));
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnvLocal();

const member = {
  email: "kakaiteclimited@gmail.com",
  name: "KakaiTec Limited",
  roles: ["user"],
};
const adminMember = {
  email: "kakaiphil@gmail.com",
  name: "KakaiK1ng",
  roles: ["user", "admin"],
};
const outsider = {
  email: "ryanmwiti15@gmail.com",
  name: "ryan",
  roles: ["user"],
};

function tabsFor(actor, rows) {
  return messageChannelTabs(
    filterChannelsForActor(rows, actor, { adminSeesAll: false }),
  ).map((t) => t.id);
}

const memberRows = await readCollection("channels", member, { adminSeesAll: false });
const adminUserModeRows = await readCollection("channels", adminMember, {
  adminSeesAll: false,
});
const outsiderRows = await readCollection("channels", outsider, { adminSeesAll: false });
const adminAllRows = await readCollection("channels", adminMember, {
  adminSeesAll: true,
});

assert.ok(
  memberRows.some((r) => r.id === "credentials"),
  "member readCollection must include credentials",
);
assert.ok(tabsFor(member, memberRows).includes("credentials"));
assert.ok(tabsFor(adminMember, adminUserModeRows).includes("credentials"));
assert.ok(!tabsFor(outsider, outsiderRows).includes("credentials"));
assert.ok(
  adminAllRows.some((r) => r.id === "credentials"),
  "admin module must list credentials",
);

const delta = await getCollectionDelta("channels", null, member, { adminSeesAll: false });
const reconciled = delta.upserts.map((u) => u.data);
assert.deepEqual(tabsFor(member, reconciled).includes("credentials") ? ["credentials"] : [], ["credentials"]);

console.log("ok: channel membership visibility (DB + Messages tabs)");
process.exit(0);
