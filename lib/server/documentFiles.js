import { randomUUID } from "crypto";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import { isServerlessRuntime } from "@/lib/server/cloudProviders";
import { query } from "@/lib/server/db";
import { realNowIso } from "@/lib/server/realTime";

export const MAX_FILE_BYTES = 25 * 1024 * 1024;

/**
 * Stay under Vercel’s ~4.5 MB serverless request body limit (FormData overhead included).
 * Client and server must agree on this value.
 */
export const UPLOAD_CHUNK_BYTES = 3 * 1024 * 1024;

/** Vercel does not run migrations; create the table if a deploy landed first. */
let ensuredTable = false;
let ensuredUploadTables = false;

async function ensureDocumentFilesTable() {
  if (ensuredTable) return;
  await query(`
    CREATE TABLE IF NOT EXISTS document_files (
      id text PRIMARY KEY,
      filename text NOT NULL,
      mime_type text,
      size_bytes integer NOT NULL,
      data bytea NOT NULL,
      author_email text,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  ensuredTable = true;
}

async function ensureDocumentUploadTables() {
  if (ensuredUploadTables) return;
  await query(`
    CREATE TABLE IF NOT EXISTS document_file_uploads (
      id text PRIMARY KEY,
      filename text NOT NULL,
      mime_type text,
      size_bytes integer NOT NULL,
      total_chunks integer NOT NULL,
      author_email text,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS document_file_upload_chunks (
      upload_id text NOT NULL REFERENCES document_file_uploads(id) ON DELETE CASCADE,
      chunk_index integer NOT NULL,
      data bytea NOT NULL,
      PRIMARY KEY (upload_id, chunk_index)
    )
  `);
  ensuredUploadTables = true;
}

export function sanitizeFilename(name) {
  const base = String(name || "document")
    .replace(/[/\\]/g, "")
    .replace(/[\r\n"]/g, "")
    .trim();
  return (base || "document").slice(0, 200);
}

/**
 * Prefer local disk for blobs outside serverless so large uploads are not
 * shipped over the wire into remote Postgres bytea (e.g. Neon).
 */
export function usesDiskDocumentFiles() {
  if (process.env.DOCUMENT_FILES_DISK === "1") return true;
  if (process.env.DOCUMENT_FILES_DISK === "0") return false;
  return !isServerlessRuntime();
}

function documentFilesDir() {
  return process.env.DOCUMENT_FILES_DIR
    || path.join(process.cwd(), "data", "document-files");
}

function assertFileId(id) {
  const value = String(id || "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error("Invalid document file id");
  }
  return value;
}

function diskPathFor(id) {
  return path.join(documentFilesDir(), assertFileId(id));
}

function diskMetaPathFor(id) {
  return `${diskPathFor(id)}.meta.json`;
}

async function writeDiskBytes(id, data) {
  await mkdir(documentFilesDir(), { recursive: true });
  await writeFile(diskPathFor(id), data);
}

/**
 * @param {string} id
 * @param {{ filename?: string, mime_type?: string | null, size_bytes?: number, author_email?: string | null }} meta
 */
async function writeDiskMeta(id, meta) {
  await mkdir(documentFilesDir(), { recursive: true });
  await writeFile(diskMetaPathFor(id), JSON.stringify({
    id: assertFileId(id),
    filename: meta.filename || "document",
    mime_type: meta.mime_type || null,
    size_bytes: Number(meta.size_bytes) || 0,
    author_email: meta.author_email || null,
  }));
}

async function readDiskBytes(id) {
  try {
    return await readFile(diskPathFor(id));
  } catch {
    return null;
  }
}

async function readDiskMeta(id) {
  try {
    const raw = await readFile(diskMetaPathFor(id), "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

async function removeDiskBytes(id) {
  try {
    await unlink(diskPathFor(id));
  } catch {
    /* missing is fine */
  }
  try {
    await unlink(diskMetaPathFor(id));
  } catch {
    /* missing is fine */
  }
}

/**
 * @param {unknown} dbData
 */
function bytesFromDb(dbData) {
  if (Buffer.isBuffer(dbData)) return dbData;
  if (dbData == null) return Buffer.alloc(0);
  return Buffer.from(dbData);
}

/**
 * Cache Neon/Postgres bytea onto local disk so later opens skip the slow remote blob fetch.
 * Does not clear remote bytea — production/serverless still needs the DB copy.
 * @param {string} id
 * @param {Buffer} data
 * @param {{ filename?: string, mime_type?: string | null, size_bytes?: number, author_email?: string | null }} [meta]
 */
async function hydrateDiskFromBytes(id, data, meta = null) {
  if (!usesDiskDocumentFiles() || !data.length) return;
  const existing = await readDiskBytes(id);
  if (!(existing?.length === data.length)) {
    await writeDiskBytes(id, data);
  }
  if (meta) {
    await writeDiskMeta(id, { ...meta, size_bytes: meta.size_bytes ?? data.length });
  }
}

/**
 * @param {string} id
 * @param {unknown} dbData
 */
async function resolveFileBytes(id, dbData) {
  const fromDisk = await readDiskBytes(id);
  if (fromDisk?.length) return fromDisk;
  const fromDb = bytesFromDb(dbData);
  if (fromDb.length) {
    await hydrateDiskFromBytes(id, fromDb);
  }
  return fromDb;
}

/**
 * @param {{ filename: string, mimeType?: string, data: Buffer, authorEmail?: string }} input
 */
export async function insertDocumentFile(input) {
  await ensureDocumentFilesTable();
  const id = randomUUID();
  const filename = sanitizeFilename(input.filename);
  const mimeType = typeof input.mimeType === "string" ? input.mimeType.slice(0, 200) : "";
  const onDisk = usesDiskDocumentFiles();
  const dbBytes = onDisk ? Buffer.alloc(0) : input.data;

  if (onDisk) {
    await writeDiskBytes(id, input.data);
    await writeDiskMeta(id, {
      filename,
      mime_type: mimeType || null,
      size_bytes: input.data.length,
      author_email: input.authorEmail || null,
    });
  }

  try {
    await query(
      `INSERT INTO document_files (id, filename, mime_type, size_bytes, data, author_email, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz)`,
      [id, filename, mimeType || null, input.data.length, dbBytes, input.authorEmail || null, realNowIso()],
    );
  } catch (err) {
    if (onDisk) await removeDiskBytes(id);
    throw err;
  }

  return {
    id,
    name: filename,
    size: input.data.length,
    mimeType: mimeType || null,
  };
}

/**
 * @param {string} id
 */
export async function getDocumentFile(id) {
  // Prefer fully local disk+meta — avoids Neon round-trips on warm cache hits.
  const fromDisk = await readDiskBytes(id);
  if (fromDisk?.length) {
    const diskMeta = await readDiskMeta(id);
    if (diskMeta?.filename) {
      return { ...diskMeta, data: fromDisk };
    }
    await ensureDocumentFilesTable();
    const meta = await getDocumentFileMeta(id);
    if (!meta) return null;
    await writeDiskMeta(id, meta);
    return { ...meta, data: fromDisk };
  }

  await ensureDocumentFilesTable();
  const result = await query(
    `SELECT id, filename, mime_type, size_bytes, data, author_email
     FROM document_files
     WHERE id = $1`,
    [id],
  );
  const row = result.rows[0] || null;
  if (!row) return null;
  const data = await resolveFileBytes(row.id, row.data);
  if (data.length) {
    await hydrateDiskFromBytes(row.id, data, row);
  }
  return { ...row, data };
}

/**
 * Pull any Postgres-backed blobs onto local disk (dev / non-serverless).
 * Safe no-op when disk storage is disabled. Leaves Neon/Postgres blobs untouched.
 * @returns {Promise<{ hydrated: number, skipped: number }>}
 */
export async function hydrateAllDocumentFilesToDisk() {
  if (!usesDiskDocumentFiles()) return { hydrated: 0, skipped: 0 };
  await ensureDocumentFilesTable();
  const result = await query(
    `SELECT id, filename, size_bytes, octet_length(data) AS data_len
     FROM document_files
     WHERE octet_length(data) > 0`,
  );
  let hydrated = 0;
  let skipped = 0;
  for (const row of result.rows) {
    const existing = await readDiskBytes(row.id);
    if (existing?.length) {
      skipped += 1;
      continue;
    }
    const blob = await query(
      `SELECT data, filename, mime_type, size_bytes, author_email FROM document_files WHERE id = $1`,
      [row.id],
    );
    const full = blob.rows[0];
    const data = bytesFromDb(full?.data);
    if (!data.length) {
      skipped += 1;
      continue;
    }
    await hydrateDiskFromBytes(row.id, data, full);
    hydrated += 1;
  }
  return { hydrated, skipped };
}

async function getDocumentFileMeta(id) {
  await ensureDocumentFilesTable();
  const result = await query(
    `SELECT id, filename, mime_type, size_bytes, author_email
     FROM document_files
     WHERE id = $1`,
    [id],
  );
  return result.rows[0] || null;
}

/**
 * @param {string} id
 * @param {{ email?: string, name?: string }} actor
 * @param {boolean} [force]
 */
export async function deleteDocumentFile(id, actor, force = false) {
  const existing = await getDocumentFileMeta(id);
  if (!existing) return { ok: false, status: 404 };
  const email = (actor?.email || "").trim().toLowerCase();
  const owner = String(existing.author_email || "").trim().toLowerCase();
  if (!force && owner && email && owner !== email) {
    return { ok: false, status: 403 };
  }
  await query(`DELETE FROM document_files WHERE id = $1`, [id]);
  await removeDiskBytes(id);
  return { ok: true };
}

/**
 * @param {string} id
 * @param {unknown} filename
 * @param {{ email?: string }} actor
 */
export async function renameDocumentFile(id, filename, actor) {
  const existing = await getDocumentFileMeta(id);
  if (!existing) return { ok: false, status: 404 };
  const email = (actor?.email || "").trim().toLowerCase();
  const owner = String(existing.author_email || "").trim().toLowerCase();
  if (owner && email && owner !== email) {
    return { ok: false, status: 403 };
  }
  const next = sanitizeFilename(filename);
  if (!next) return { ok: false, status: 400 };
  await query(`UPDATE document_files SET filename = $2 WHERE id = $1`, [id, next]);
  if (usesDiskDocumentFiles()) {
    const meta = await readDiskMeta(id);
    if (meta) {
      await writeDiskMeta(id, { ...meta, filename: next });
    }
  }
  return { ok: true, filename: next };
}

/**
 * @param {unknown} value
 * @returns {value is Blob}
 */
export function isUploadBlob(value) {
  return Boolean(
    value
    && typeof value === "object"
    && typeof value.arrayBuffer === "function"
    && typeof value.size === "number",
  );
}

async function purgeStaleDocumentUploads() {
  await ensureDocumentUploadTables();
  await query(
    `DELETE FROM document_file_uploads
     WHERE created_at < now() - interval '2 hours'`,
  );
}

/**
 * Store one chunk of a multi-part upload. Final chunk assembles into document_files.
 * @param {{
 *   uploadId?: string | null,
 *   chunkIndex: number,
 *   chunkTotal: number,
 *   filename: string,
 *   mimeType?: string,
 *   sizeBytes: number,
 *   data: Buffer,
 *   authorEmail: string,
 * }} input
 */
export async function putDocumentUploadChunk(input) {
  await purgeStaleDocumentUploads();

  const chunkIndex = Number(input.chunkIndex);
  const chunkTotal = Number(input.chunkTotal);
  const sizeBytes = Number(input.sizeBytes);
  const authorEmail = String(input.authorEmail || "").trim().toLowerCase();
  const data = Buffer.isBuffer(input.data) ? input.data : Buffer.from(input.data || []);

  if (!authorEmail) throw Object.assign(new Error("Forbidden"), { status: 403 });
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
    throw Object.assign(new Error("Invalid chunk index"), { status: 400 });
  }
  if (!Number.isInteger(chunkTotal) || chunkTotal < 1 || chunkTotal > 64) {
    throw Object.assign(new Error("Invalid chunk total"), { status: 400 });
  }
  if (chunkIndex >= chunkTotal) {
    throw Object.assign(new Error("Chunk index out of range"), { status: 400 });
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes < 1 || sizeBytes > MAX_FILE_BYTES) {
    throw Object.assign(new Error("File must be 25 MB or smaller"), { status: 413 });
  }
  if (!data.length || data.length > UPLOAD_CHUNK_BYTES + 64 * 1024) {
    throw Object.assign(new Error("Invalid chunk size"), { status: 400 });
  }

  const expectedMax = Math.ceil(sizeBytes / UPLOAD_CHUNK_BYTES);
  if (chunkTotal !== expectedMax) {
    throw Object.assign(new Error("Chunk plan does not match file size"), { status: 400 });
  }

  const filename = sanitizeFilename(input.filename);
  const mimeType = typeof input.mimeType === "string" ? input.mimeType.slice(0, 200) : "";
  let uploadId = input.uploadId ? assertFileId(input.uploadId) : null;

  if (!uploadId) {
    if (chunkIndex !== 0) {
      throw Object.assign(new Error("Start upload with chunk 0"), { status: 400 });
    }
    uploadId = randomUUID();
    await query(
      `INSERT INTO document_file_uploads
         (id, filename, mime_type, size_bytes, total_chunks, author_email, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz)`,
      [uploadId, filename, mimeType || null, sizeBytes, chunkTotal, authorEmail, realNowIso()],
    );
  } else {
    const existing = await query(
      `SELECT id, filename, mime_type, size_bytes, total_chunks, author_email
       FROM document_file_uploads WHERE id = $1`,
      [uploadId],
    );
    const row = existing.rows[0];
    if (!row) throw Object.assign(new Error("Upload session not found"), { status: 404 });
    if (String(row.author_email || "").trim().toLowerCase() !== authorEmail) {
      throw Object.assign(new Error("Forbidden"), { status: 403 });
    }
    if (Number(row.total_chunks) !== chunkTotal || Number(row.size_bytes) !== sizeBytes) {
      throw Object.assign(new Error("Upload session mismatch"), { status: 400 });
    }
  }

  await query(
    `INSERT INTO document_file_upload_chunks (upload_id, chunk_index, data)
     VALUES ($1, $2, $3)
     ON CONFLICT (upload_id, chunk_index)
     DO UPDATE SET data = EXCLUDED.data`,
    [uploadId, chunkIndex, data],
  );

  const counted = await query(
    `SELECT COUNT(*)::int AS n FROM document_file_upload_chunks WHERE upload_id = $1`,
    [uploadId],
  );
  const received = Number(counted.rows[0]?.n) || 0;

  if (received < chunkTotal) {
    return { uploadId, received, total: chunkTotal, done: false, files: null };
  }

  const parts = await query(
    `SELECT chunk_index, data
     FROM document_file_upload_chunks
     WHERE upload_id = $1
     ORDER BY chunk_index ASC`,
    [uploadId],
  );
  if (parts.rows.length !== chunkTotal) {
    throw Object.assign(new Error("Missing upload chunks"), { status: 400 });
  }

  const buffers = parts.rows.map((row) => bytesFromDb(row.data));
  const assembled = Buffer.concat(buffers);
  if (assembled.length !== sizeBytes) {
    throw Object.assign(new Error("Assembled size does not match file"), { status: 400 });
  }

  const meta = await query(
    `SELECT filename, mime_type FROM document_file_uploads WHERE id = $1`,
    [uploadId],
  );
  const metaRow = meta.rows[0] || {};
  const file = await insertDocumentFile({
    filename: metaRow.filename || filename,
    mimeType: metaRow.mime_type || mimeType || "",
    data: assembled,
    authorEmail,
  });

  await query(`DELETE FROM document_file_uploads WHERE id = $1`, [uploadId]);

  return { uploadId, received, total: chunkTotal, done: true, files: [file] };
}

/**
 * Drop an in-progress chunked upload (cancel / replace).
 * @param {string} uploadId
 * @param {{ email?: string }} actor
 */
export async function abortDocumentUpload(uploadId, actor) {
  await ensureDocumentUploadTables();
  const id = assertFileId(uploadId);
  const existing = await query(
    `SELECT author_email FROM document_file_uploads WHERE id = $1`,
    [id],
  );
  const row = existing.rows[0];
  if (!row) return { ok: false, status: 404 };
  const email = String(actor?.email || "").trim().toLowerCase();
  const owner = String(row.author_email || "").trim().toLowerCase();
  if (owner && email && owner !== email) {
    return { ok: false, status: 403 };
  }
  await query(`DELETE FROM document_file_uploads WHERE id = $1`, [id]);
  return { ok: true };
}

/**
 * Content-Disposition for browser viewers (`inline`) or forced save (`attachment`).
 * @param {string} filename
 * @param {"inline" | "attachment"} [disposition]
 */
export function documentContentDisposition(filename, disposition = "inline") {
  const safe = sanitizeFilename(filename);
  const ascii = safe.replace(/[^\w.\-() ]+/g, "_") || "document";
  const mode = disposition === "attachment" ? "attachment" : "inline";
  return `${mode}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}
