#!/usr/bin/env node
/**
 * Cache document_files bytea onto local disk for fast opens in non-serverless dev.
 * Does not modify Postgres blobs.
 */
import fs from "fs";
import path from "path";
import pg from "pg";

function loadEnvFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function envValue(key) {
  const blob = `${loadEnvFile(".env.local")}\n${loadEnvFile(".env")}`;
  const match = blob.match(new RegExp(`^${key}=(.+)$`, "m"));
  if (!match) return process.env[key] || "";
  return match[1].trim().replace(/^["']|["']$/g, "");
}

const url = envValue("DATABASE_URL");
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const dir = envValue("DOCUMENT_FILES_DIR")
  || path.join(process.cwd(), "data", "document-files");

await fs.promises.mkdir(dir, { recursive: true });

const client = new pg.Client({
  connectionString: url,
  connectionTimeoutMillis: 30_000,
  ssl: /neon\.tech|sslmode=require/i.test(url)
    ? { rejectUnauthorized: false }
    : undefined,
});

const t0 = Date.now();
await client.connect();
const { rows } = await client.query(
  `SELECT id, filename, size_bytes, octet_length(data) AS data_len
   FROM document_files
   ORDER BY created_at DESC NULLS LAST`,
);

let hydrated = 0;
let skipped = 0;
for (const row of rows) {
  const dest = path.join(dir, row.id);
  try {
    const st = await fs.promises.stat(dest);
    if (st.size > 0) {
      skipped += 1;
      console.log(`skip  ${row.id} (${row.filename}) — already on disk (${st.size} B)`);
      continue;
    }
  } catch {
    /* missing */
  }

  if (!Number(row.data_len)) {
    skipped += 1;
    console.log(`skip  ${row.id} — empty bytea`);
    continue;
  }

  const t1 = Date.now();
  const blob = await client.query(
    `SELECT data, filename, mime_type, size_bytes, author_email FROM document_files WHERE id = $1`,
    [row.id],
  );
  const full = blob.rows[0] || {};
  const data = full.data;
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data || []);
  await fs.promises.writeFile(dest, buf);
  await fs.promises.writeFile(
    `${dest}.meta.json`,
    JSON.stringify({
      id: row.id,
      filename: full.filename || row.filename,
      mime_type: full.mime_type || null,
      size_bytes: full.size_bytes || buf.length,
      author_email: full.author_email || null,
    }),
  );
  hydrated += 1;
  console.log(`ok    ${row.id} (${row.filename}) ${buf.length} B in ${Date.now() - t1}ms`);
}

await client.end();
console.log(`done hydrated=${hydrated} skipped=${skipped} totalMs=${Date.now() - t0}`);
