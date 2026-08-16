/**
 * Copy portal tables between two Postgres databases (e.g. Neon → local Docker).
 *
 *   FROM_DATABASE_URL='postgresql://…neon.tech/…' \
 *   TO_DATABASE_URL='postgresql://portal:portal@localhost:5432/portal' \
 *   node scripts/copy-pg-between.mjs
 *
 * Copies users, role_access, collection_items. Skips request/activity logs.
 * Neon sources use the HTTP driver (TCP 5432 is often blocked locally).
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import pg from "pg";
import { neon } from "@neondatabase/serverless";

function sslFor(url) {
  if (/sslmode=require|neon\.tech|supabase\.co/i.test(url)) {
    return { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "0" };
  }
  return undefined;
}

function cleanUrl(url) {
  return url.replace(/&?channel_binding=require/g, "").replace(/\?&/, "?").replace(/\?$/, "");
}

function poolFor(url) {
  const cleaned = cleanUrl(url);
  return new pg.Pool({
    connectionString: cleaned,
    ssl: sslFor(cleaned),
    max: 2,
  });
}

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

function requireUrl(name, fallbacks = []) {
  for (const key of [name, ...fallbacks]) {
    if (process.env[key]) return process.env[key];
  }
  throw new Error(
    `${name} is not set. Put the Neon URI in .env.local as NEON_DATABASE_URL, then run npm run db:copy`,
  );
}

function isNeon(url) {
  return /neon\.tech/i.test(url);
}

async function sourceQuery(from, sql, params = []) {
  if (from.kind === "neon") {
    const result = await from.sql.query(sql, params);
    return { rows: result.rows || [] };
  }
  return from.client.query(sql, params);
}

async function tableExists(from, name) {
  const res = await sourceQuery(from, `SELECT to_regclass($1) AS t`, [`public.${name}`]);
  return !!res.rows[0]?.t;
}

function pgValue(val) {
  if (val == null) return val;
  if (Array.isArray(val) || (typeof val === "object" && !(val instanceof Date))) {
    return JSON.stringify(val);
  }
  return val;
}

async function copyTable(from, to, sqlSelect, sqlInsert, columns) {
  const src = await sourceQuery(from, sqlSelect);
  let written = 0;
  for (const row of src.rows) {
    await to.query(sqlInsert, columns.map((col) => pgValue(row[col])));
    written += 1;
  }
  return { source: src.rows.length, written };
}

async function main() {
  const fromUrl = requireUrl("FROM_DATABASE_URL", ["NEON_DATABASE_URL"]);
  const toUrl = process.env.TO_DATABASE_URL
    || (isNeon(process.env.DATABASE_URL || "")
      ? "postgresql://portal:portal@localhost:5432/portal"
      : (process.env.DATABASE_URL || "postgresql://portal:portal@localhost:5432/portal"));

  if (cleanUrl(fromUrl) === cleanUrl(toUrl)) {
    throw new Error("Source and destination DATABASE_URL are the same");
  }

  const from = isNeon(fromUrl)
    ? { kind: "neon", sql: neon(cleanUrl(fromUrl), { fullResults: true }) }
    : { kind: "pg", pool: poolFor(fromUrl), client: null };

  const toPool = poolFor(toUrl);
  const toClient = await toPool.connect();

  if (from.kind === "pg") {
    from.client = await from.pool.connect();
  }

  try {
    for (const name of ["users", "role_access", "collection_items"]) {
      if (!(await tableExists(from, name))) {
        throw new Error(`Source is missing table ${name} — run migrations on Neon first`);
      }
      const dest = await toClient.query(`SELECT to_regclass($1) AS t`, [`public.${name}`]);
      if (!dest.rows[0]?.t) {
        throw new Error(`Destination is missing table ${name} — run npm run migrate locally`);
      }
    }

    await toClient.query("BEGIN");

    const reports = [];

    reports.push({
      label: "users",
      ...(await copyTable(
        from,
        toClient,
        `SELECT id, email, name, avatar, approved, created_at, updated_at FROM users`,
        `INSERT INTO users (id, email, name, avatar, approved, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (email) DO UPDATE SET
           name = EXCLUDED.name,
           avatar = EXCLUDED.avatar,
           approved = EXCLUDED.approved,
           updated_at = EXCLUDED.updated_at`,
        ["id", "email", "name", "avatar", "approved", "created_at", "updated_at"],
      )),
    });

    reports.push({
      label: "role_access",
      ...(await copyTable(
        from,
        toClient,
        `SELECT id, emails, updated_at FROM role_access`,
        `INSERT INTO role_access (id, emails, updated_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET
           emails = EXCLUDED.emails,
           updated_at = EXCLUDED.updated_at`,
        ["id", "emails", "updated_at"],
      )),
    });

    await toClient.query("DELETE FROM collection_items");
    reports.push({
      label: "collection_items",
      ...(await copyTable(
        from,
        toClient,
        `SELECT collection_name, id, data, author_email, updated_at, deleted_at FROM collection_items`,
        `INSERT INTO collection_items (collection_name, id, data, author_email, updated_at, deleted_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ["collection_name", "id", "data", "author_email", "updated_at", "deleted_at"],
      )),
    });

    await toClient.query("COMMIT");

    const breakdown = await toClient.query(
      `SELECT collection_name, COUNT(*)::int AS n
       FROM collection_items
       WHERE deleted_at IS NULL
       GROUP BY collection_name
       ORDER BY collection_name`,
    );

    console.log("Copied Neon → local:");
    for (const row of reports) {
      console.log(`  ${row.label}: ${row.written} rows`);
    }
    console.log("Local collection_items by name:");
    if (!breakdown.rows.length) {
      console.log("  (empty)");
    }
    for (const row of breakdown.rows) {
      console.log(`  ${row.collection_name}: ${row.n}`);
    }
  } catch (err) {
    try {
      await toClient.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    if (from.kind === "pg" && from.client) {
      from.client.release();
      await from.pool.end();
    }
    toClient.release();
    await toPool.end();
  }
}

main().catch((err) => {
  console.error("Copy failed:", err.message);
  process.exitCode = 1;
});
