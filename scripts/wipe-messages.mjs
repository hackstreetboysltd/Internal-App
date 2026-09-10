/**
 * Soft-delete all messages / pending_messages (enc v4 clean break for hybrid v5).
 * Usage: npm run wipe:messages
 * Loads DATABASE_URL from .env.local (same as verify-local).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";

function loadEnvLocal() {
  const path = fileURLToPath(new URL("../.env.local", import.meta.url));
  try {
    const env = {};
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const i = t.indexOf("=");
      env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
    }
    return env;
  } catch {
    return {};
  }
}

const fileEnv = loadEnvLocal();
const DATABASE_URL =
  process.env.DATABASE_URL ||
  fileEnv.DATABASE_URL ||
  "postgresql://portal:portal@localhost:5433/portal";

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const now = new Date().toISOString();
  try {
    const before = await pool.query(
      `SELECT COUNT(*)::int AS n FROM collection_items
       WHERE collection_name IN ('messages', 'pending_messages')
         AND deleted_at IS NULL`,
    );
    const res = await pool.query(
      `UPDATE collection_items
       SET deleted_at = $1::timestamptz, updated_at = $1::timestamptz
       WHERE collection_name IN ('messages', 'pending_messages')
         AND deleted_at IS NULL
       RETURNING collection_name, id`,
      [now],
    );
    console.log(`Live message rows before wipe: ${before.rows[0]?.n ?? 0}`);
    console.log(`Wiped ${res.rowCount} message row(s).`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
