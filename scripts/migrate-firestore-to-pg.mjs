/**
 * One-time Firestore → PostgreSQL migration.
 *
 * Usage:
 *   node scripts/migrate-firestore-to-pg.mjs --live
 *   node scripts/migrate-firestore-to-pg.mjs --from-export=./firestore-export.json
 *   node scripts/migrate-firestore-to-pg.mjs --live --dry-run
 *
 * Live mode prefers firebase-admin (service account). If none is set, it falls
 * back to the Firebase client SDK using NEXT_PUBLIC_FIREBASE_* from .env.local
 * (same access the old static portal used).
 *
 * Destination: NEON_DATABASE_URL, else DATABASE_URL.
 * Neon hosts use the HTTPS driver (TCP 5432 is often blocked locally).
 */
import { readFileSync } from "fs";
import { readFile } from "fs/promises";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { neon } from "@neondatabase/serverless";

function loadEnvFile(path) {
  try {
    const text = readFileSync(path, "utf8");
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const eq = line.indexOf("=");
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith("\"") && val.endsWith("\"")) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (key && process.env[key] == null) process.env[key] = val;
    }
  } catch {
    /* optional */
  }
}

loadEnvFile(fileURLToPath(new URL("../.env.local", import.meta.url)));
loadEnvFile(fileURLToPath(new URL("../.env.neon", import.meta.url)));
loadEnvFile(fileURLToPath(new URL("../.env", import.meta.url)));

export const MIGRATABLE_COLLECTIONS = [
  "skills",
  "procedures",
  "goals",
  "calendar",
  "meetings",
  "messages",
  "apps",
  "documents",
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

function cleanUrl(url) {
  return url.replace(/&?channel_binding=require/g, "").replace(/\?&/, "?").replace(/\?$/, "");
}

function destUrl() {
  return process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || "postgresql://portal:portal@localhost:5432/portal";
}

function isNeon(url) {
  return /neon\.tech/i.test(url);
}

function pgValue(val) {
  if (val == null) return val;
  if (Array.isArray(val) || (typeof val === "object" && !(val instanceof Date))) {
    return JSON.stringify(val);
  }
  return val;
}

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

function hasServiceAccount() {
  return !!(
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON
    || process.env.FIREBASE_SERVICE_ACCOUNT_PATH
    || process.env.GOOGLE_APPLICATION_CREDENTIALS
  );
}

/**
 * @returns {Promise<Record<string, unknown[]>>}
 */
export async function loadFromFirestoreLive() {
  if (hasServiceAccount()) {
    return loadFromFirestoreAdmin();
  }
  console.log("No service account — reading Firestore with client SDK (NEXT_PUBLIC_FIREBASE_*).");
  return loadFromFirestoreClient();
}

async function loadFromFirestoreAdmin() {
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
  const snap = await db.collection("modules").get();
  for (const docSnap of snap.docs) {
    data[docSnap.id] = docSnap.data()?.data || [];
  }
  for (const name of MIGRATABLE_COLLECTIONS) {
    if (!(name in data)) data[name] = [];
  }
  return data;
}

async function loadFromFirestoreClient() {
  const { initializeApp, getApps } = await import("firebase/app");
  const { getFirestore, collection, getDocs } = await import("firebase/firestore");

  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY || "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || process.env.FIREBASE_AUTH_DOMAIN || "",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || "",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET || "",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || process.env.FIREBASE_MESSAGING_SENDER_ID || "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || process.env.FIREBASE_APP_ID || "",
  };

  if (!config.apiKey || !config.projectId) {
    throw new Error("NEXT_PUBLIC_FIREBASE_API_KEY / PROJECT_ID missing from .env.local");
  }

  const app = getApps().length ? getApps()[0] : initializeApp(config);
  const db = getFirestore(app);
  const snap = await getDocs(collection(db, "modules"));

  /** @type {Record<string, unknown[]>} */
  const data = {};
  snap.forEach((docSnap) => {
    data[docSnap.id] = docSnap.data()?.data || [];
  });
  for (const name of MIGRATABLE_COLLECTIONS) {
    if (!(name in data)) data[name] = [];
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

function createDest(url) {
  const cleaned = cleanUrl(url);
  if (isNeon(cleaned)) {
    const sql = neon(cleaned, { fullResults: true });
    return {
      kind: "neon",
      async query(text, params = []) {
        const result = await sql.query(text, params);
        return { rows: result.rows || [] };
      },
      async end() {},
    };
  }

  const pool = new pg.Pool({
    connectionString: cleaned,
    ssl: /sslmode=require|neon\.tech|supabase\.co/i.test(cleaned)
      ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "0" }
      : undefined,
  });
  return {
    kind: "pg",
    query: (text, params) => pool.query(text, params),
    end: () => pool.end(),
  };
}

/**
 * @param {{ query: Function }} dest
 * @param {string} collectionName
 * @param {unknown[]} items
 * @param {boolean} dryRun
 */
async function writeCollectionItems(dest, collectionName, items, dryRun) {
  const list = normalizeItems(items);

  if (collectionName === "role_access") {
    if (dryRun) return list.length;
    for (const item of list) {
      if (!item.id) continue;
      await dest.query(
        `INSERT INTO role_access (id, emails, updated_at)
         VALUES ($1, $2::jsonb, now())
         ON CONFLICT (id) DO UPDATE SET
           emails = EXCLUDED.emails,
           updated_at = now()`,
        [item.id, pgValue(item.emails || [])],
      );
    }
    return list.length;
  }

  if (dryRun) return list.length;

  await dest.query("DELETE FROM collection_items WHERE collection_name = $1", [collectionName]);

  for (const item of list) {
    const rowId = String(item.id ?? item.email ?? Date.now());
    const authorEmail = item.author_email || item.authorEmail || null;
    await dest.query(
      `INSERT INTO collection_items (collection_name, id, data, author_email, updated_at)
       VALUES ($1, $2, $3::jsonb, $4, now())`,
      [collectionName, rowId, pgValue(item), authorEmail],
    );
  }

  return list.length;
}

function collectionNamesFrom(data, only) {
  if (only) return [only];
  const extras = Object.keys(data).filter((name) => !MIGRATABLE_COLLECTIONS.includes(name));
  return [...MIGRATABLE_COLLECTIONS, ...extras];
}

/**
 * @param {{ query: Function }} dest
 * @param {Record<string, unknown[]>} data
 * @param {{ dryRun?: boolean, collection?: string | null }} [options]
 */
export async function migrateFirestoreData(dest, data, options = {}) {
  const { dryRun = false, collection = null } = options;
  const names = collectionNamesFrom(data, collection);
  /** @type {Record<string, number>} */
  const written = {};

  for (const name of names) {
    const items = data[name] || [];
    written[name] = await writeCollectionItems(dest, name, items, dryRun);
  }

  return written;
}

/**
 * @param {{ query: Function }} dest
 * @param {Record<string, unknown[]>} source
 */
export async function verifyMigrationCounts(dest, source) {
  /** @type {Record<string, { source: number, postgres: number, ok: boolean }>} */
  const report = {};
  const names = collectionNamesFrom(source, null);

  for (const name of names) {
    const sourceCount = normalizeItems(source[name] || []).length;
    let postgresCount = 0;

    if (name === "role_access") {
      const res = await dest.query(`SELECT COUNT(*)::int AS n FROM role_access`);
      postgresCount = res.rows[0]?.n || 0;
    } else {
      const res = await dest.query(
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

  const url = destUrl();
  const destKind = isNeon(url) ? "neon-http" : "postgres";
  console.log(`Writing to ${destKind}`);

  const dest = createDest(url);

  try {
    if (options.verifyOnly) {
      const report = await verifyMigrationCounts(dest, data);
      printReport(report);
      const failed = Object.values(report).filter((r) => !r.ok);
      if (failed.length) process.exitCode = 1;
      return;
    }

    const written = await migrateFirestoreData(dest, data, {
      dryRun: options.dryRun,
      collection: options.collection,
    });

    console.log(options.dryRun ? "Dry run counts:" : "Migrated row counts:");
    for (const [name, count] of Object.entries(written)) {
      console.log(`  ${name}: ${count}`);
    }

    if (!options.dryRun) {
      const report = await verifyMigrationCounts(dest, data);
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
    await dest.end();
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
  main()
    .catch((err) => {
      console.error("Migration failed:", err.message);
      process.exitCode = 1;
    })
    .finally(() => {
      process.exit(process.exitCode || 0);
    });
}
