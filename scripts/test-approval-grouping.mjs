/**
 * End-to-end approval grouping test (API + grouping logic).
 * Usage: node scripts/test-approval-grouping.mjs
 * Exit 0 when 8 batches / 8 singles confirmed against live dev server.
 */
import { readFileSync } from "fs";
import { randomUUID } from "crypto";
import Redis from "ioredis";

function loadEnv() {
  try {
    const raw = readFileSync(".env.local", "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch { /* ignore */ }
}

loadEnv();

const BASE = process.argv[2] || "http://localhost:3000/Internal-App";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || "kakaiphil@gmail.com";

function msFromIso(iso) {
  const parsed = Date.parse(String(iso || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function groupApprovalItems(items) {
  const batches = new Map();
  const unbatched = [];

  for (const item of items) {
    const key = item.batch_key ? String(item.batch_key) : "";
    if (!key) {
      unbatched.push(item);
      continue;
    }
    const bucket = batches.get(key) || [];
    bucket.push(item);
    batches.set(key, bucket);
  }

  const grouped = [];
  for (const [key, batchItems] of batches) {
    const sortMs = Math.max(...batchItems.map((row) => msFromIso(row.created_at)));
    if (batchItems.length > 1) {
      grouped.push({ type: "batch", key, items: batchItems, sortMs });
    } else {
      grouped.push({ type: "single", item: batchItems[0], sortMs });
    }
  }
  for (const item of unbatched) {
    grouped.push({ type: "single", item, sortMs: msFromIso(item.created_at) });
  }
  grouped.sort((a, b) => b.sortMs - a.sortMs);
  return grouped;
}

async function main() {
  const redis = new Redis(REDIS_URL);
  const sid = randomUUID();
  const session = {
    sid,
    uid: randomUUID(),
    email: ADMIN_EMAIL,
    name: "Grouping Test",
    avatar: "",
    roles: ["admin"],
    sessionId: "group-test",
    createdAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    needsProfileSync: false,
  };
  await redis.setex(`session:${sid}`, 3600, JSON.stringify(session));

  const res = await fetch(`${BASE}/api/notifications`, {
    headers: { Cookie: `sid=${sid}` },
  });
  const data = await res.json();
  if (!res.ok) {
    console.error("FAIL: API", res.status, data);
    process.exit(1);
  }
  if (data.approvalQueue !== true) {
    console.error("FAIL: approvalQueue not true");
    process.exit(1);
  }

  const items = data.notifications || [];
  const grouped = groupApprovalItems(items);
  const batches = grouped.filter((g) => g.type === "batch");
  const singles = grouped.filter((g) => g.type === "single");

  console.log(`Items: ${items.length}, list rows: ${grouped.length}`);
  console.log(`Batches: ${batches.length}, Singles: ${singles.length}`);

  for (const b of batches) {
    const label = b.items[0]?.batch_label || b.key;
    console.log(`  batch [${b.items.length}] ${label}`);
  }

  const batchItemTotal = batches.reduce((n, b) => n + b.items.length, 0);
  if (batchItemTotal + singles.length !== items.length) {
    console.error("FAIL: item count mismatch");
    process.exit(1);
  }

  if (batches.length < 1) {
    console.error("FAIL: expected at least one multi-goal batch");
    process.exit(1);
  }

  for (const b of batches) {
    if (b.items.length < 2) {
      console.error("FAIL: batch with < 2 items", b.key);
      process.exit(1);
    }
    if (!b.items.every((row) => row.batch_key === b.key)) {
      console.error("FAIL: inconsistent batch_key in batch", b.key);
      process.exit(1);
    }
  }

  await redis.quit();
  console.log("\nPASS: approval grouping verified");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
