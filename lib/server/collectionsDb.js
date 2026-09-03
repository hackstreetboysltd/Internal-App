import { query, getPool } from "@/lib/server/db";
import { assertValidCollectionName } from "@/lib/server/collectionNames";
import { portalTimeZone, realNowIso, realNowMs } from "@/lib/server/realTime";
import { invalidateAllowedCache } from "@/lib/server/whitelist";

function getDefaultRoleAccessSeed() {
  return [
    { id: "allowed", emails: ["kakaiphil@gmail.com"] },
    { id: "admins", emails: ["kakaiphil@gmail.com"] },
  ];
}

/**
 * @param {string} collectionName
 * @param {unknown[]} data
 * @param {{ persist?: (items: unknown[]) => Promise<void> }} [ctx]
 */
export async function applyReadInterceptors(collectionName, data, ctx = {}) {
  const items = Array.isArray(data) ? [...data] : [];
  if (collectionName === "role_access" && items.length === 0) {
    const seed = getDefaultRoleAccessSeed();
    if (typeof ctx.persist === "function") {
      await ctx.persist(seed);
    }
    return seed;
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
  items = await applyReadInterceptors(collectionName, items);
  return items;
}

/** Namespace for pg_advisory_xact_lock on collection writes. */
const COLLECTION_LOCK_NS = 924831;

/**
 * @param {unknown} item
 */
function collectionItemId(item) {
  if (!item || typeof item !== "object") return String(realNowMs());
  return String(item.id ?? item.email ?? realNowMs());
}

/**
 * @param {unknown[]} items
 * @param {string} collectionName
 */
function normalizeItemsForSave(collectionName, items) {
  let list = items;
  if (collectionName === "goals") {
    list = items.map((record) => {
      if (!record || typeof record !== "object") return record;
      const { title, ...rest } = record;
      return rest;
    });
  }
  return list;
}

/**
 * Last-write-wins dedupe so a single INSERT cannot violate the primary key.
 * @param {unknown[]} items
 */
function dedupeItemsById(items) {
  /** @type {Map<string, { id: string, data: string, author: string | null }>} */
  const byId = new Map();
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const id = collectionItemId(item);
    byId.set(id, {
      id,
      data: JSON.stringify(item.id == null ? { ...item, id } : item),
      author: item.author_email || null,
    });
  }
  return [...byId.values()];
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

  const now = realNowIso();
  let listToSave = normalizeItemsForSave(collectionName, items);
  listToSave = await stampCollectionWallTimes(collectionName, listToSave, now, knownItems);

  const rows = dedupeItemsById(listToSave).map((row) => ({
    ...row,
    author: authorEmail || row.author,
  }));
  const keepIds = rows.map((row) => row.id);

  const pool = await getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1, hashtext($2))", [
      COLLECTION_LOCK_NS,
      collectionName,
    ]);

    if (rows.length > 0) {
      const params = [];
      const placeholders = [];
      let i = 1;
      for (const row of rows) {
        placeholders.push(
          `($${i++}, $${i++}, $${i++}::jsonb, $${i++}, $${i++}::timestamptz, NULL)`,
        );
        params.push(collectionName, row.id, row.data, row.author, now);
      }
      await client.query(
        `INSERT INTO collection_items (collection_name, id, data, author_email, updated_at, deleted_at)
         VALUES ${placeholders.join(",")}
         ON CONFLICT (collection_name, id) DO UPDATE SET
           data = EXCLUDED.data,
           author_email = EXCLUDED.author_email,
           updated_at = EXCLUDED.updated_at,
           deleted_at = NULL`,
        params,
      );
    }

    if (keepIds.length === 0) {
      await client.query(
        `UPDATE collection_items
         SET deleted_at = $2::timestamptz,
             author_email = COALESCE($3, author_email),
             updated_at = $2::timestamptz
         WHERE collection_name = $1 AND deleted_at IS NULL`,
        [collectionName, now, authorEmail],
      );
    } else {
      await client.query(
        `UPDATE collection_items
         SET deleted_at = $3::timestamptz,
             author_email = COALESCE($4, author_email),
             updated_at = $3::timestamptz
         WHERE collection_name = $1
           AND deleted_at IS NULL
           AND NOT (id = ANY($2::text[]))`,
        [collectionName, keepIds, now, authorEmail],
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
 * Upsert a single collection row without touching siblings.
 * @param {string} collectionName
 * @param {Record<string, unknown>} item
 * @param {string | null} authorEmail
 * @param {unknown} [knownItem]
 */
export async function upsertCollectionItem(collectionName, item, authorEmail, knownItem) {
  assertValidCollectionName(collectionName);
  if (!item || typeof item !== "object") {
    throw new Error("Collection item must be an object");
  }

  const now = realNowIso();
  let listToSave = normalizeItemsForSave(collectionName, [item]);
  const previous = knownItem != null ? [knownItem] : undefined;
  listToSave = await stampCollectionWallTimes(collectionName, listToSave, now, previous);
  const next = listToSave[0];
  if (!next || typeof next !== "object") {
    throw new Error("Collection item must be an object");
  }

  const id = collectionItemId(next);
  const data = next.id == null ? { ...next, id } : next;

  await query(
    `INSERT INTO collection_items (collection_name, id, data, author_email, updated_at, deleted_at)
     VALUES ($1, $2, $3::jsonb, $4, $5::timestamptz, NULL)
     ON CONFLICT (collection_name, id) DO UPDATE SET
       data = EXCLUDED.data,
       author_email = EXCLUDED.author_email,
       updated_at = EXCLUDED.updated_at,
       deleted_at = NULL`,
    [collectionName, id, JSON.stringify(data), authorEmail || data.author_email || null, now],
  );

  return data;
}

/**
 * @param {unknown[]} items
 */
async function writeRoleAccessCollection(items) {
  const normalized = Array.isArray(items) ? items.map((item) => {
    if (!item || typeof item !== "object") return item;
    return {
      ...item,
      emails: Array.isArray(item.emails) ? item.emails : [],
    };
  }) : [];

  const allowedRec = normalized.find((item) => item?.id === "allowed");
  const adminRec = normalized.find((item) => item?.id === "admins");
  if (allowedRec && adminRec && Array.isArray(adminRec.emails)) {
    const allowedSet = new Set(
      allowedRec.emails.map((entry) => String(entry || "").trim().toLowerCase()),
    );
    for (const entry of adminRec.emails) {
      const email = String(entry || "").trim();
      if (!email.includes("@")) continue;
      const key = email.toLowerCase();
      if (!allowedSet.has(key)) {
        allowedRec.emails.push(email);
        allowedSet.add(key);
      }
    }
  }

  const now = realNowIso();
  for (const item of normalized) {
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
  invalidateAllowedCache();
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
  return upsertCollectionItem(collectionName, next, authorEmail, existing);
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
 * @param {string} email
 */
async function findProfileByEmail(email) {
  const needle = email.toLowerCase();
  const byId = await getCollectionItem("profile", needle);
  if (byId) return byId;

  const items = await listCollectionItems("profile");
  return (
    items.find((p) => p?.email && String(p.email).toLowerCase() === needle) || null
  );
}

/**
 * Save a pending (not-allowed) Google profile into the profile collection.
 * @param {{ email: string, name?: string, avatar?: string }} user
 */
export async function upsertPendingProfile(user) {
  const email = String(user?.email || "").trim();
  if (!email) return;

  const existing = await findProfileByEmail(email);
  /** @type {Record<string, unknown>} */
  let next;
  if (!existing) {
    next = {
      id: email.toLowerCase(),
      email,
      name: user.name || email.split("@")[0],
      avatar: user.avatar || "",
      role: "Software Engineer",
      department: "Development",
      bio: "Hi, I am new to the portal! Connected via Google authentication.",
      approvedStatus: "pending",
    };
  } else {
    next = { ...existing };
    if (user.avatar) next.avatar = user.avatar;
    if (!next.name) next.name = user.name || email.split("@")[0];
    if (!next.approvedStatus) next.approvedStatus = "pending";
    if (next.id == null) next.id = email.toLowerCase();
  }

  await upsertCollectionItem("profile", next, email, existing);
}

/**
 * Sync Google profile fields for an allowed user after OAuth login.
 * Upserts only that user's row.
 * @param {{ email: string, name?: string, avatar?: string }} user
 * @returns {Promise<{ name: string, email: string, avatar: string } | null>}
 */
export async function upsertLoginProfile(user) {
  const email = String(user?.email || "").trim();
  if (!email) return null;

  let sessionName = user.name || email.split("@")[0] || "A Team Member";
  const existing = await findProfileByEmail(email);

  /** @type {Record<string, unknown>} */
  let next;
  if (!existing) {
    next = {
      id: email.toLowerCase(),
      email,
      name: user.name,
      avatar: user.avatar || "",
      role: "Software Engineer",
      department: "Development",
      bio: "Hi, I am new to the portal! Connected via Google authentication.",
    };
  } else {
    next = { ...existing };
    if (user.avatar) next.avatar = user.avatar;
    if (!next.name) {
      next.name = user.name;
    } else {
      sessionName = String(next.name);
      const googleName = (user.name || "").trim();
      const profileName = String(next.name || "").trim();
      if (googleName && googleName.toLowerCase() !== profileName.toLowerCase()) {
        const aliases = Array.isArray(next.nameAliases) ? [...next.nameAliases] : [];
        if (!aliases.some((a) => String(a || "").trim().toLowerCase() === googleName.toLowerCase())) {
          aliases.push(googleName);
          next.nameAliases = aliases;
        }
      }
    }
    if (next.id == null) next.id = email.toLowerCase();
  }

  await upsertCollectionItem("profile", next, email, existing);

  return {
    name: sessionName,
    email,
    avatar: user.avatar || "custom",
  };
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
