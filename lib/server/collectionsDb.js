import { query, getPool } from "@/lib/server/db";
import { assertValidCollectionName } from "@/lib/server/collectionNames";
import {
  applyKnownGoalAssigneeAliases,
  emailForStoredOwnerName,
  normalizeEmail,
} from "@/lib/normalize";

function getDefaultGoalsSeed() {
  const getWeekIdentifier = (date) => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
  };

  const now = new Date();
  const currentWeek = getWeekIdentifier(now);
  const currentMonth = `${now.getFullYear()}-M${String(now.getMonth() + 1).padStart(2, "0")}`;
  const currentAnnual = `${now.getFullYear()}`;

  return [
    {
      id: 1720000000001,
      user: "Phil Kakai",
      email: "kakaiphil@gmail.com",
      goals: [
        { text: "Transition all modules to single page suite", done: true },
        { text: "Adopt Firestore as primary datastore", done: true },
        { text: "Reach 1000 satisfied internal portal users", done: false },
      ],
      weekId: null,
      periodId: currentAnnual,
      type: "annual",
    },
    {
      id: 1720000000002,
      user: "Mulei",
      goals: [
        { text: "Adopt batched writes for database transactions", done: true },
        { text: "Improve cache invalidation strategies", done: true },
        { text: "Reduce API response latency by 20%", done: false },
      ],
      weekId: null,
      periodId: currentMonth,
      type: "monthly",
    },
    {
      id: 1720000000003,
      user: "Mulei",
      goals: [
        { text: "Profile latency on large profile reads", done: true },
        { text: "Implement defensive type checks on sync functions", done: true },
        { text: "Configure index optimization rules", done: true },
      ],
      weekId: currentWeek,
      periodId: currentWeek,
      type: "weekly",
    },
    {
      id: 1720000000004,
      user: "ryan mwiti",
      goals: [
        { text: "Resolve mobile viewport overflow issues", done: true },
        { text: "Align goals tab-group styling across dashboards", done: false },
        { text: "Clean up redundant local fallback scripts", done: true },
      ],
      weekId: currentWeek,
      periodId: currentWeek,
      type: "weekly",
    },
    {
      id: 1720000000005,
      user: "ryan mwiti",
      goals: [
        { text: "Implement standardized modal notifications", done: true },
        { text: "Refactor goals edit to prevent duplicate creation", done: false },
      ],
      weekId: currentWeek,
      periodId: currentWeek,
      type: "weekly",
    },
  ];
}

function getDefaultRoleAccessSeed() {
  return [
    { id: "allowed", emails: ["kakaiphil@gmail.com"] },
    { id: "admins", emails: ["kakaiphil@gmail.com"] },
  ];
}

const BLOCKLISTED_EMAILS = new Set([
  "2103334@students.kcau.ac.ke",
  "kakaiking@gmail.com",
  "kingkakai@gmail.com",
  "phil.kakai@gmail.com",
  "phil@kakai.org",
  "admin@kakai.org",
  "mulei@gmail.com",
  "mulei@kakai.org",
  "ryanmwiti@gmail.com",
  "ryan.mwiti@gmail.com",
  "ryanmwiti@kakai.org",
]);

const PROFILE_BLOCKLIST = new Set([
  "2103334@students.kcau.ac.ke",
  "kakaiking@gmail.com",
  "phil@kakai.org",
  "admin@kakai.org",
  "kingkakai@gmail.com",
  "phil.kakai@gmail.com",
  "mulei@kakai.org",
  "ryanmwiti@kakai.org",
  "ryan.mwiti@gmail.com",
]);

/**
 * @param {string} collectionName
 * @param {unknown[]} data
 * @param {{ persist?: (items: unknown[]) => Promise<void> }} [ctx]
 */
export async function applyReadInterceptors(collectionName, data, ctx = {}) {
  let items = Array.isArray(data) ? [...data] : [];
  let updated = false;

  if (collectionName === "goals" && items.length === 0) {
    items = getDefaultGoalsSeed();
    updated = true;
  }

  if (collectionName === "role_access") {
    const seed = getDefaultRoleAccessSeed();
    if (items.length === 0) {
      items = seed;
      updated = true;
    } else {
      let approvedEmailsFromProfiles = [];
      try {
        const profiles = await listCollectionItems("profile");
        approvedEmailsFromProfiles = profiles
          .filter((p) => p.approvedStatus === "approved")
          .map((p) => normalizeEmail(p.email));
      } catch {
        /* ignore */
      }

      items = items.map((record) => {
        if (!record || !record.emails) return record;
        const filtered = record.emails.filter((email) => {
          const norm = normalizeEmail(email);
          return !BLOCKLISTED_EMAILS.has(norm) || approvedEmailsFromProfiles.includes(norm);
        });
        if (filtered.length !== record.emails.length) {
          updated = true;
          return { ...record, emails: filtered };
        }
        return record;
      });

      seed.forEach((s) => {
        let record = items.find((r) => r.id === s.id);
        if (!record) {
          items.push(s);
          updated = true;
        } else {
          const emails = Array.isArray(record.emails) ? [...record.emails] : [];
          let changed = false;
          s.emails.forEach((email) => {
            if (!emails.map((e) => normalizeEmail(e)).includes(normalizeEmail(email))) {
              emails.push(email);
              changed = true;
            }
          });
          if (changed) {
            record = { ...record, emails };
            items = items.map((r) => (r.id === record.id ? record : r));
            updated = true;
          }
        }
      });
    }
  }

  if (collectionName === "profile") {
    const before = items.length;
    items = items.filter((r) => {
      if (!r || !r.email) return false;
      const norm = normalizeEmail(r.email);
      if (PROFILE_BLOCKLIST.has(norm)) {
        return !!r.approvedStatus;
      }
      return true;
    });
    if (items.length !== before) updated = true;
  }

  if (collectionName === "goals") {
    items = items.map((record) => {
      if (record && Object.prototype.hasOwnProperty.call(record, "title")) {
        updated = true;
        const { title, ...rest } = record;
        return rest;
      }
      return record;
    });

    try {
      const users = await listCollectionItems("profile");
      items = items.map((record) => {
        if (!record || typeof record !== "object") return record;
        let next = applyKnownGoalAssigneeAliases(record, users);
        if (next !== record) updated = true;
        const email = emailForStoredOwnerName(next.user || next.author, users);
        if (email && normalizeEmail(next.email) !== email) {
          updated = true;
          next = { ...next, email };
        }
        return next;
      });
    } catch {
      /* ignore */
    }
  }

  if (updated && typeof ctx.persist === "function") {
    await ctx.persist(items);
  }

  return items;
}

/**
 * @param {string} collectionName
 */
export async function listCollectionItems(collectionName) {
  assertValidCollectionName(collectionName);

  if (collectionName === "role_access") {
    return readRoleAccessAsCollection();
  }

  const result = await query(
    `SELECT id, data FROM collection_items
     WHERE collection_name = $1 AND deleted_at IS NULL
     ORDER BY updated_at ASC`,
    [collectionName],
  );

  return result.rows.map((row) => {
    const item = row.data && typeof row.data === "object" ? row.data : {};
    if (item.id == null) {
      return { ...item, id: row.id };
    }
    return item;
  });
}

async function readRoleAccessAsCollection() {
  const result = await query(`SELECT id, emails FROM role_access ORDER BY id`);
  return result.rows.map((row) => ({
    id: row.id,
    emails: Array.isArray(row.emails) ? row.emails : [],
  }));
}

/**
 * @param {string} collectionName
 */
export async function readCollection(collectionName) {
  assertValidCollectionName(collectionName);
  let items = await listCollectionItems(collectionName);
  items = await applyReadInterceptors(collectionName, items, {
    persist: (next) => replaceCollectionItems(collectionName, next, null),
  });
  return items;
}

/**
 * @param {string} collectionName
 * @param {unknown[]} items
 * @param {string | null} authorEmail
 */
export async function replaceCollectionItems(collectionName, items, authorEmail) {
  assertValidCollectionName(collectionName);

  if (!Array.isArray(items)) {
    throw new Error("Collection payload must be an array");
  }

  if (collectionName === "role_access") {
    await writeRoleAccessCollection(items);
    return;
  }

  let listToSave = items;
  if (collectionName === "goals") {
    listToSave = items.map((record) => {
      if (!record || typeof record !== "object") return record;
      const { title, ...rest } = record;
      return rest;
    });
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM collection_items WHERE collection_name = $1", [collectionName]);

    for (const item of listToSave) {
      if (!item || typeof item !== "object") continue;
      const rowId = String(item.id ?? item.email ?? Date.now());
      await client.query(
        `INSERT INTO collection_items (collection_name, id, data, author_email, updated_at)
         VALUES ($1, $2, $3::jsonb, $4, now())`,
        [
          collectionName,
          rowId,
          JSON.stringify(item),
          authorEmail || item.author_email || null,
        ],
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * @param {unknown[]} items
 */
async function writeRoleAccessCollection(items) {
  for (const item of items) {
    if (!item || !item.id) continue;
    await query(
      `INSERT INTO role_access (id, emails, updated_at)
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (id) DO UPDATE SET
         emails = EXCLUDED.emails,
         updated_at = now()`,
      [item.id, JSON.stringify(item.emails || [])],
    );
  }
}

/**
 * @param {string} collectionName
 * @param {string} id
 */
export async function getCollectionItem(collectionName, id) {
  assertValidCollectionName(collectionName);

  if (collectionName === "role_access") {
    const all = await readRoleAccessAsCollection();
    return all.find((r) => String(r.id) === String(id)) || null;
  }

  const result = await query(
    `SELECT id, data FROM collection_items
     WHERE collection_name = $1 AND id = $2 AND deleted_at IS NULL`,
    [collectionName, String(id)],
  );
  if (!result.rows.length) return null;
  const row = result.rows[0];
  const item = row.data && typeof row.data === "object" ? row.data : {};
  return item.id == null ? { ...item, id: row.id } : item;
}

/**
 * @param {string} collectionName
 * @param {string} id
 * @param {Record<string, unknown>} patch
 * @param {string | null} authorEmail
 */
export async function patchCollectionItem(collectionName, id, patch, authorEmail) {
  const existing = await getCollectionItem(collectionName, id);
  if (!existing) return null;
  const next = { ...existing, ...patch, id: existing.id ?? id };
  const all = await listCollectionItems(collectionName);
  const merged = all.map((item) => (String(item.id) === String(id) ? next : item));
  if (!all.some((item) => String(item.id) === String(id))) {
    merged.push(next);
  }
  await replaceCollectionItems(collectionName, merged, authorEmail);
  return next;
}

/**
 * @param {string} collectionName
 * @param {string} id
 * @param {string | null} authorEmail
 */
export async function softDeleteCollectionItem(collectionName, id, authorEmail) {
  assertValidCollectionName(collectionName);
  await query(
    `UPDATE collection_items
     SET deleted_at = now(), author_email = COALESCE($3, author_email), updated_at = now()
     WHERE collection_name = $1 AND id = $2 AND deleted_at IS NULL`,
    [collectionName, String(id), authorEmail],
  );
  return true;
}

/**
 * Save a pending (not-allowed) Google profile into the profile collection.
 * @param {{ email: string, name?: string, avatar?: string }} user
 */
export async function upsertPendingProfile(user) {
  const email = String(user?.email || "").trim();
  if (!email) return;

  const items = await listCollectionItems("profile");
  const idx = items.findIndex(
    (p) => p?.email && String(p.email).toLowerCase() === email.toLowerCase(),
  );

  if (idx === -1) {
    items.push({
      id: email.toLowerCase(),
      email,
      name: user.name || email.split("@")[0],
      avatar: user.avatar || "",
      role: "Software Engineer",
      department: "Development",
      bio: "Hi, I am new to the portal! Connected via Google authentication.",
      approvedStatus: "pending",
    });
  } else {
    const next = { ...items[idx] };
    if (user.avatar) next.avatar = user.avatar;
    if (!next.name) next.name = user.name || email.split("@")[0];
    if (!next.approvedStatus) next.approvedStatus = "pending";
    items[idx] = next;
  }

  await replaceCollectionItems("profile", items, email);
}

/**
 * @param {unknown} item
 * @param {string} rowId
 */
function rowToCollectionItem(item, rowId) {
  const data = item && typeof item === "object" ? item : {};
  return data.id == null ? { ...data, id: rowId } : data;
}

/**
 * @param {Date | string | null | undefined} value
 */
function toIso(value) {
  if (!value) return new Date(0).toISOString();
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? new Date(0).toISOString() : d.toISOString();
}

/**
 * Delta sync for a collection since an ISO cursor.
 * @param {string} collectionName
 * @param {string | null | undefined} sinceIso
 */
export async function getCollectionDelta(collectionName, sinceIso) {
  assertValidCollectionName(collectionName);

  if (collectionName === "role_access") {
    return getRoleAccessDelta(sinceIso);
  }

  const since = sinceIso ? new Date(sinceIso) : null;
  const validSince = since && !Number.isNaN(since.getTime()) ? since : null;

  if (!validSince) {
    const items = await readCollection(collectionName);
    const cursor = new Date().toISOString();
    return {
      cursor,
      upserts: items.map((item) => ({
        id: String(item.id),
        data: item,
        updated_at: cursor,
      })),
      deletes: [],
    };
  }

  const result = await query(
    `SELECT id, data, updated_at, deleted_at
     FROM collection_items
     WHERE collection_name = $1
       AND (updated_at > $2 OR (deleted_at IS NOT NULL AND deleted_at > $2))
     ORDER BY updated_at ASC`,
    [collectionName, validSince],
  );

  /** @type {{ id: string, data: unknown, updated_at: string }[]} */
  const upserts = [];
  /** @type {string[]} */
  const deletes = [];
  let cursor = validSince.toISOString();

  for (const row of result.rows) {
    const changeAt = row.deleted_at || row.updated_at;
    const changeIso = toIso(changeAt);
    if (new Date(changeIso) > new Date(cursor)) {
      cursor = changeIso;
    }

    if (row.deleted_at) {
      deletes.push(String(row.id));
    } else {
      upserts.push({
        id: String(row.id),
        data: rowToCollectionItem(row.data, row.id),
        updated_at: toIso(row.updated_at),
      });
    }
  }

  if (collectionName === "goals" && upserts.length === 0 && deletes.length === 0) {
    const items = await listCollectionItems(collectionName);
    if (items.length === 0) {
      const seeded = await applyReadInterceptors(collectionName, [], {
        persist: (next) => replaceCollectionItems(collectionName, next, null),
      });
      const seedCursor = new Date().toISOString();
      return {
        cursor: seedCursor,
        upserts: seeded.map((item) => ({
          id: String(item.id),
          data: item,
          updated_at: seedCursor,
        })),
        deletes: [],
      };
    }
  }

  return { cursor, upserts, deletes };
}

/**
 * @param {string | null | undefined} sinceIso
 */
async function getRoleAccessDelta(sinceIso) {
  const since = sinceIso ? new Date(sinceIso) : null;
  const validSince = since && !Number.isNaN(since.getTime()) ? since : null;

  if (!validSince) {
    const items = await readCollection("role_access");
    const cursor = new Date().toISOString();
    return {
      cursor,
      upserts: items.map((item) => ({
        id: String(item.id),
        data: item,
        updated_at: cursor,
      })),
      deletes: [],
    };
  }

  const result = await query(
    `SELECT id, emails, updated_at
     FROM role_access
     WHERE updated_at > $1
     ORDER BY updated_at ASC`,
    [validSince],
  );

  const upserts = result.rows.map((row) => ({
    id: String(row.id),
    data: {
      id: row.id,
      emails: Array.isArray(row.emails) ? row.emails : [],
    },
    updated_at: toIso(row.updated_at),
  }));

  const cursor = upserts.length
    ? upserts[upserts.length - 1].updated_at
    : validSince.toISOString();

  return { cursor, upserts, deletes: [] };
}

/**
 * @param {string} collectionName
 */
export async function getCollectionManifest(collectionName) {
  assertValidCollectionName(collectionName);

  if (collectionName === "role_access") {
    const result = await query(`SELECT id, updated_at FROM role_access ORDER BY id`);
    /** @type {Record<string, string>} */
    const manifest = {};
    for (const row of result.rows) {
      manifest[String(row.id)] = toIso(row.updated_at);
    }
    return manifest;
  }

  const result = await query(
    `SELECT id, updated_at
     FROM collection_items
     WHERE collection_name = $1 AND deleted_at IS NULL
     ORDER BY id`,
    [collectionName],
  );

  /** @type {Record<string, string>} */
  const manifest = {};
  for (const row of result.rows) {
    manifest[String(row.id)] = toIso(row.updated_at);
  }
  return manifest;
}
