import { randomUUID } from "crypto";
import { query } from "@/lib/server/db";
import { realNowIso } from "@/lib/server/realTime";

export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export function sanitizeFilename(name) {
  const base = String(name || "document")
    .replace(/[/\\]/g, "")
    .replace(/[\r\n"]/g, "")
    .trim();
  return (base || "document").slice(0, 200);
}

/**
 * @param {{ filename: string, mimeType?: string, data: Buffer, authorEmail?: string }} input
 */
export async function insertDocumentFile(input) {
  const id = randomUUID();
  const filename = sanitizeFilename(input.filename);
  const mimeType = typeof input.mimeType === "string" ? input.mimeType.slice(0, 200) : "";
  await query(
    `INSERT INTO document_files (id, filename, mime_type, size_bytes, data, author_email, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz)`,
    [id, filename, mimeType || null, input.data.length, input.data, input.authorEmail || null, realNowIso()],
  );
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
  const result = await query(
    `SELECT id, filename, mime_type, size_bytes, data, author_email
     FROM document_files
     WHERE id = $1`,
    [id],
  );
  return result.rows[0] || null;
}

async function getDocumentFileMeta(id) {
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
