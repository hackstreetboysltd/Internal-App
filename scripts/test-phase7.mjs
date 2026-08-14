/**
 * Phase 7 smoke test — Firestore export → Postgres migration.
 * Usage: node scripts/test-phase7.mjs
 */
import pg from "pg";
import {
  migrateFirestoreData,
  verifyMigrationCounts,
} from "./migrate-firestore-to-pg.mjs";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://portal:portal@localhost:5432/portal";

const FIXTURE = {
  settings: [{ id: "global", emailNotificationsPaused: false, phase7: true }],
  profile: [{
    id: "p1",
    email: "phase7@example.com",
    name: "Phase 7 User",
    role: "Engineer",
  }],
  role_access: [
    { id: "allowed", emails: ["phase7@example.com"] },
    { id: "admins", emails: ["admin@example.com"] },
  ],
  goals: [{
    id: 9001,
    user: "Phase 7 User",
    email: "phase7@example.com",
    goals: [{ text: "Migrate off Firestore", done: true }],
    type: "weekly",
    periodId: "2026-W33",
  }],
};

async function main() {
  console.log("Phase 7 migration tests");
  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  try {
    await pool.query(`DELETE FROM collection_items WHERE collection_name IN ('settings', 'profile', 'goals')`);
    await pool.query(`DELETE FROM role_access`);

    const dry = await migrateFirestoreData(pool, FIXTURE, { dryRun: true, collection: "settings" });
    if (dry.settings !== 1) {
      throw new Error("Dry run count mismatch");
    }
    console.log("dry-run OK");

    const written = await migrateFirestoreData(pool, FIXTURE);
    if (written.settings !== 1 || written.role_access !== 2) {
      throw new Error("Migration write counts unexpected");
    }
    console.log("migration write OK");

    const report = await verifyMigrationCounts(pool, FIXTURE);
    const mismatches = Object.entries(report).filter(([name, row]) => !row.ok && name in FIXTURE);
    if (mismatches.length) {
      throw new Error(`Verification mismatches: ${mismatches.map(([n]) => n).join(", ")}`);
    }
    console.log("verification OK");

    const settingsRow = await pool.query(
      `SELECT data FROM collection_items WHERE collection_name = 'settings' AND id = 'global'`,
    );
    if (!settingsRow.rows[0]?.data?.phase7) {
      throw new Error("Settings JSONB payload not preserved");
    }
    console.log("JSONB field preservation OK");

    const allowed = await pool.query(`SELECT emails FROM role_access WHERE id = 'allowed'`);
    const emails = allowed.rows[0]?.emails || [];
    if (!emails.includes("phase7@example.com")) {
      throw new Error("role_access not migrated correctly");
    }
    console.log("role_access table OK");

    console.log("\nPhase 7 tests passed.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Phase 7 tests failed:", err.message);
  process.exitCode = 1;
});
