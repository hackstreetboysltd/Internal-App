import { query, getPool } from "@/lib/server/db";
import { assertValidCollectionName } from "@/lib/server/collectionNames";
import {
  applyKnownGoalAssigneeAliases,
  emailForStoredOwnerName,
  normalizeEmail,
} from "@/lib/normalize";
import { portalTimeZone, realNowIso, realNowMs } from "@/lib/server/realTime";

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

/** Hardcoded demo cards from the old empty-goals seed. Strip on read so they cannot come back. */
const DEMO_GOAL_IDS = new Set([
  "1720000000001",
  "1720000000002",
  "1720000000003",
  "1720000000004",
  "1720000000005",
]);

/**
 * @param {string} collectionName
 * @param {unknown[]} data
 * @param {{ persist?: (items: unknown[]) => Promise<void> }} [ctx]
 */
export async function applyReadInterceptors(collectionName, data, ctx = {}) {
  let items = Array.isArray(data) ? [...data] : [];
  let updated = false;

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
    const goalsBefore = items.length;
    items = items.filter((record) => {
      const id = record && typeof record === "object" ? String(record.id ?? "") : "";
      return !DEMO_GOAL_IDS.has(id);
    });
    if (items.length !== goalsBefore) updated = true;

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

const STAMP_COLLECTIONS = new Set([
  "goals",
  "messages",
  "documents",
  "calendar",
  "meetings",
  "pending_goals",
  "pending_messages",
  "pending_calendar",
  "pending_meetings",
  "pending_documents",
]);

function stampNestedPostedAt(oldDocs, newDocs, nowIso) {
  const oldById = new Map(
    (Array.isArray(oldDocs) ? oldDocs : []).map((doc) => [String(doc.id), doc]),
  );
  return (Array.isArray(newDocs) ? newDocs : []).map((doc) => {
    if (!doc || typeof doc !== "object") return doc;
    const prev = oldById.get(String(doc.id));
    if (prev) {
      return prev.postedAt ? { ...doc, postedAt: prev.postedAt } : doc;
    }
    return { ...doc, postedAt: nowIso };
  });
}

function stampModuleItem(collectionName, oldItem, item, nowIso) {
  if (!item || typeof item !== "object") return item;
  const next = { ...item };
  const isNew = !oldItem;
  const base = collectionName.startsWith("pending_") ? collectionName.slice("pending_".length) : collectionName;

  if (collectionName.startsWith("pending_") && next.data && typeof next.data === "object") {
    next.data = stampModuleItem(base, oldItem && oldItem.data, next.data, nowIso);
  }

  if (base === "goals") {
    if (isNew) next.createdAt = nowIso;
    else if (oldItem.createdAt) next.createdAt = oldItem.createdAt;
  }

  if (base === "messages") {
    if (isNew) {
      next.createdAt = nowIso;
      next.timestamp = new Date(nowIso).toLocaleTimeString("en-US", {
        timeZone: portalTimeZone(),
        hour: "numeric",
        minute: "2-digit",
      });
    } else if (oldItem.createdAt) {
      next.createdAt = oldItem.createdAt;
    }
  }

  if (base === "documents") {
    if (isNew) next.postedAt = nowIso;
    else if (oldItem.postedAt) next.postedAt = oldItem.postedAt;
    if (Array.isArray(next.documents)) {
      next.documents = stampNestedPostedAt(oldItem && oldItem.documents, next.documents, nowIso);
    }
  }

  if (base === "calendar" || base === "meetings") {
    if (Array.isArray(next.documents)) {
      next.documents = stampNestedPostedAt(oldItem && oldItem.documents, next.documents, nowIso);
    }
  }

  return next;
}

/**
 * @param {string} collectionName
 * @param {unknown[]} items
 * @param {string} nowIso
 */
async function stampCollectionWallTimes(collectionName, items, nowIso, previousItems) {
  if (!STAMP_COLLECTIONS.has(collectionName)) return items;
  const previous = previousItems || await listCollectionItems(collectionName);
  const oldById = new Map(previous.map((row) => [String(row.id), row]));
  return items.map((item) => {
    if (!item || typeof item !== "object") return item;
    return stampModuleItem(collectionName, oldById.get(String(item.id)), item, nowIso);
  });
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
 * @param {unknown[]} [knownItems] already-loaded rows, skips a second read when stamping times
 */
export async function replaceCollectionItems(collectionName, items, authorEmail, knownItems) {
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

  const now = realNowIso();
  listToSave = await stampCollectionWallTimes(collectionName, listToSave, now, knownItems);

  const rows = [];
  for (const item of listToSave) {
    if (!item || typeof item !== "object") continue;
    rows.push({
      id: String(item.id ?? item.email ?? realNowMs()),
      data: JSON.stringify(item),
      author: authorEmail || item.author_email || null,
    });
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM collection_items WHERE collection_name = $1", [collectionName]);

    if (rows.length > 0) {
      const params = [];
      const placeholders = [];
      let i = 1;
      for (const row of rows) {
        placeholders.push(`($${i++}, $${i++}, $${i++}::jsonb, $${i++}, $${i++}::timestamptz)`);
        params.push(collectionName, row.id, row.data, row.author, now);
      }
      await client.query(
        `INSERT INTO collection_items (collection_name, id, data, author_email, updated_at)
         VALUES ${placeholders.join(",")}`,
        params,
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
  const now = realNowIso();
  for (const item of items) {
    if (!item || !item.id) continue;
    await query(
      `INSERT INTO role_access (id, emails, updated_at)
       VALUES ($1, $2::jsonb, $3::timestamptz)
       ON CONFLICT (id) DO UPDATE SET
         emails = EXCLUDED.emails,
         updated_at = $3::timestamptz`,
      [item.id, JSON.stringify(item.emails || []), now],
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
  const now = realNowIso();
  await query(
    `UPDATE collection_items
     SET deleted_at = $4::timestamptz,
         author_email = COALESCE($3, author_email),
         updated_at = $4::timestamptz
     WHERE collection_name = $1 AND id = $2 AND deleted_at IS NULL`,
    [collectionName, String(id), authorEmail, now],
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
    const cursor = realNowIso();
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
    const cursor = realNowIso();
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
