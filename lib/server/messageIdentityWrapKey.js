import { randomBytes } from "crypto";
import { query } from "@/lib/server/db";

const ROW_ID = "default";

/** Vercel does not run migrations; create the table if a deploy landed first. */
let ensuredTable = false;
/** @type {Buffer | null} */
let cachedKey = null;

async function ensureWrapKeyTable() {
  if (ensuredTable) return;
  await query(`
    CREATE TABLE IF NOT EXISTS message_identity_wrap_keys (
      id text PRIMARY KEY,
      key bytea NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  ensuredTable = true;
}

/**
 * One AES key for every host that shares this Postgres. SESSION_SECRET is
 * per-environment (start.sh vs Vercel) and cannot unwrap a blob written by
 * the other.
 *
 * @returns {Promise<Buffer>}
 */
export async function getOrCreateDbIdentityWrapKey() {
  if (cachedKey) return cachedKey;
  await ensureWrapKeyTable();
  const existing = await query(
    "SELECT key FROM message_identity_wrap_keys WHERE id = $1",
    [ROW_ID],
  );
  if (existing.rows[0]?.key) {
    cachedKey = Buffer.from(existing.rows[0].key);
    return cachedKey;
  }
  const generated = randomBytes(32);
  await query(
    `INSERT INTO message_identity_wrap_keys (id, key) VALUES ($1, $2)
     ON CONFLICT (id) DO NOTHING`,
    [ROW_ID, generated],
  );
  const again = await query(
    "SELECT key FROM message_identity_wrap_keys WHERE id = $1",
    [ROW_ID],
  );
  if (!again.rows[0]?.key) {
    throw new Error("Could not persist message identity wrap key");
  }
  cachedKey = Buffer.from(again.rows[0].key);
  return cachedKey;
}

/** Drop the process cache (tests). */
export function resetDbIdentityWrapKeyCache() {
  cachedKey = null;
  ensuredTable = false;
}
