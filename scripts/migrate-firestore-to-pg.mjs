/**
 * One-time Firestore → PostgreSQL migration.
 *
 * Usage:
 *   node scripts/migrate-firestore-to-pg.mjs --from-export=./firestore-export.json
 *   node scripts/migrate-firestore-to-pg.mjs --live
 *   node scripts/migrate-firestore-to-pg.mjs --from-export=./export.json --dry-run
 *   node scripts/migrate-firestore-to-pg.mjs --from-export=./export.json --collection=profile
 *
 * Live mode requires firebase-admin and one of:
 *   FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
 *   FIREBASE_SERVICE_ACCOUNT_PATH=/path/to/serviceAccount.json
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json
 */
import { readFile } from "fs/promises";
import { pathToFileURL } from "node:url";
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://portal:portal@localhost:5432/portal";

export const MIGRATABLE_COLLECTIONS = [
  "skills",
  "procedures",
  "goals",
  "calendar",
  "meetings",
  "messages",
  "apps",
  "profile",
  "auth",
  "settings",
  "pending_skills",
  "pending_procedures",
  "pending_goals",
  "pending_calendar",
  "pending_meetings",
  "pending_messages",
  "pending_apps",
  "pending_profile",
  "role_access",
];

function parseArgs(argv) {
  const options = {
    fromExport: null,
    live: false,
    dryRun: false,
    collection: null,
    verifyOnly: false,
  };

  for (const arg of argv) {
    if (arg === "--live") options.live = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--verify-only") options.verifyOnly = true;
    else if (arg.startsWith("--from-export=")) options.fromExport = arg.slice("--from-export=".length);
    else if (arg.startsWith("--collection=")) options.collection = arg.slice("--collection=".length);
  }

  return options;
}

/**
 * @param {string} path
 */
export async function loadExportFile(path) {
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Export file must be a JSON object keyed by collection name");
  }
  return parsed;
}

/**
 * @returns {Promise<Record<string, unknown[]>>}
 */
export async function loadFromFirestoreLive() {
  let admin;
  try {
    admin = await import("firebase-admin");
  } catch {
    throw new Error("firebase-admin is required for --live. Run: npm install -D firebase-admin");
  }

  if (!admin.apps.length) {
    const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS;

    if (json) {
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(json)),
      });
    } else if (path) {
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(await readFile(path, "utf8"))),
      });
    } else {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
      });
    }
  }

  const db = admin.firestore();
  /** @type {Record<string, unknown[]>} */
  const data = {};

  for (const name of MIGRATABLE_COLLECTIONS) {
    const snap = await db.collection("modules").doc(name).get();
    data[name] = snap.exists ? (snap.data()?.data || []) : [];
  }

  return data;
}

/**
 * @param {unknown[]} items
 */
function normalizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items.filter((item) => item && typeof item === "object");
}

/**
 * @param {import('pg').PoolClient} client
 * @param {string} collectionName
 * @param {unknown[]} items
 * @param {boolean} dryRun
 */
async function writeCollectionItems(client, collectionName, items, dryRun) {
  const list = normalizeItems(items);

  if (collectionName === "role_access") {
    if (dryRun) return list.length;
    for (const item of list) {
      if (!item.id) continue;
      await client.query(
        `INSERT INTO role_access (id, emails, updated_at)
         VALUES ($1, $2::jsonb, now())
         ON CONFLICT (id) DO UPDATE SET
           emails = EXCLUDED.emails,
           updated_at = now()`,
        [item.id, JSON.stringify(item.emails || [])],
      );
    }
    return list.length;
  }

  if (dryRun) return list.length;

  await client.query("DELETE FROM collection_items WHERE collection_name = $1", [collectionName]);

  for (const item of list) {
    const rowId = String(item.id ?? item.email ?? Date.now());
    const authorEmail = item.author_email || item.authorEmail || null;
    await client.query(
      `INSERT INTO collection_items (collection_name, id, data, author_email, updated_at)
       VALUES ($1, $2, $3::jsonb, $4, now())`,
      [collectionName, rowId, JSON.stringify(item), authorEmail],
    );
  }

  return list.length;
}

/**
 * @param {import('pg').Pool} pool
 * @param {Record<string, unknown[]>} data
 * @param {{ dryRun?: boolean, collection?: string | null }} [options]
 */
export async function migrateFirestoreData(pool, data, options = {}) {
  const { dryRun = false, collection = null } = options;
  const names = collection ? [collection] : MIGRATABLE_COLLECTIONS;
  /** @type {Record<string, number>} */
  const written = {};

  const client = await pool.connect();
  try {
    if (!dryRun) await client.query("BEGIN");

    for (const name of names) {
      if (!MIGRATABLE_COLLECTIONS.includes(name)) {
        throw new Error(`Unknown collection: ${name}`);
      }
      const items = data[name] || [];
      written[name] = await writeCollectionItems(client, name, items, dryRun);
    }

    if (!dryRun) await client.query("COMMIT");
  } catch (err) {
    if (!dryRun) await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return written;
}

/**
 * @param {import('pg').Pool} pool
 * @param {Record<string, unknown[]>} source
 */
export async function verifyMigrationCounts(pool, source) {
  /** @type {Record<string, { source: number, postgres: number, ok: boolean }>} */
  const report = {};

  for (const name of MIGRATABLE_COLLECTIONS) {
    const sourceCount = normalizeItems(source[name] || []).length;
    let postgresCount = 0;

    if (name === "role_access") {
      const res = await pool.query(`SELECT COUNT(*)::int AS n FROM role_access`);
      postgresCount = res.rows[0]?.n || 0;
    } else {
      const res = await pool.query(
        `SELECT COUNT(*)::int AS n FROM collection_items WHERE collection_name = $1 AND deleted_at IS NULL`,
        [name],
      );
      postgresCount = res.rows[0]?.n || 0;
    }

    report[name] = {
      source: sourceCount,
      postgres: postgresCount,
      ok: sourceCount === postgresCount,
    };
  }

  return report;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (!options.fromExport && !options.live) {
    console.error("Provide --from-export=path.json or --live");
    process.exitCode = 1;
    return;
  }

  /** @type {Record<string, unknown[]>} */
  let data;
  if (options.fromExport) {
    console.log("Loading export:", options.fromExport);
    data = await loadExportFile(options.fromExport);
  } else {
    console.log("Reading live Firestore modules/* …");
    data = await loadFromFirestoreLive();
  }

  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  try {
    if (options.verifyOnly) {
      const report = await verifyMigrationCounts(pool, data);
      printReport(report);
      const failed = Object.values(report).filter((r) => !r.ok);
      if (failed.length) process.exitCode = 1;
      return;
    }

    const written = await migrateFirestoreData(pool, data, {
      dryRun: options.dryRun,
      collection: options.collection,
    });

    console.log(options.dryRun ? "Dry run counts:" : "Migrated row counts:");
    for (const [name, count] of Object.entries(written)) {
      console.log(`  ${name}: ${count}`);
    }

    if (!options.dryRun) {
      const report = await verifyMigrationCounts(pool, data);
      printReport(report);
      const failed = Object.values(report).filter((r) => !r.ok);
      if (failed.length) {
        console.error("\nVerification failed for one or more collections.");
        process.exitCode = 1;
      } else {
        console.log("\nVerification passed — source and Postgres counts match.");
      }
    }
  } finally {
    await pool.end();
  }
}

/**
 * @param {Record<string, { source: number, postgres: number, ok: boolean }>} report
 */
function printReport(report) {
  console.log("\nCollection verification:");
  for (const [name, row] of Object.entries(report)) {
    const mark = row.ok ? "OK" : "MISMATCH";
    console.log(`  ${name}: source=${row.source} postgres=${row.postgres} [${mark}]`);
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((err) => {
    console.error("Migration failed:", err.message);
    process.exitCode = 1;
  });
}
