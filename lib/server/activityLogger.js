import { query } from "@/lib/server/db";
import { publishActivityEvent } from "@/lib/server/publishEvent";
import { realNowIso } from "@/lib/server/realTime";

/**
 * @typedef {Object} ActivityLogEntry
 * @property {string | null} uid
 * @property {string} email
 * @property {string | null} sessionId
 * @property {string} eventType
 * @property {string | null} [path]
 * @property {Record<string, unknown>} [meta]
 * @property {string} ip
 */

const MAX_EVENTS_PER_BATCH = 50;

/**
 * @param {unknown} events
 */
export function normalizeActivityBatch(events) {
  if (!Array.isArray(events)) {
    throw new Error("events must be an array");
  }
  if (events.length === 0) {
    throw new Error("events must not be empty");
  }
  if (events.length > MAX_EVENTS_PER_BATCH) {
    throw new Error(`events exceeds max batch size (${MAX_EVENTS_PER_BATCH})`);
  }

  return events.map((raw, index) => {
    if (!raw || typeof raw !== "object") {
      throw new Error(`events[${index}] must be an object`);
    }
    const eventType = typeof raw.eventType === "string" ? raw.eventType.trim() : "";
    if (!eventType || eventType.length > 64 || !/^[a-z][a-z0-9_.]*$/i.test(eventType)) {
      throw new Error(`events[${index}].eventType is invalid`);
    }

    const path = typeof raw.path === "string" ? raw.path.slice(0, 512) : null;
    let meta = {};
    if (raw.meta && typeof raw.meta === "object" && !Array.isArray(raw.meta)) {
      meta = raw.meta;
    }

    return {
      eventType,
      path,
      meta,
      clientTs: realNowIso(),
    };
  });
}

/**
 * Persist + publish activity events (non-blocking persist errors logged).
 * @param {ActivityLogEntry[]} entries
 */
export async function logActivityEvents(entries) {
  const timestamp = realNowIso();

  for (const entry of entries) {
    const record = {
      uid: entry.uid || null,
      email: entry.email,
      sessionId: entry.sessionId || null,
      eventType: entry.eventType,
      path: entry.path || null,
      meta: entry.meta || {},
      ip: entry.ip,
      timestamp,
    };

    await publishActivityEvent(record);
  }

  persistActivityLogs(entries, timestamp).catch((err) => {
    console.error("Failed to persist activity_logs:", err);
  });
}

/**
 * @param {ActivityLogEntry[]} entries
 * @param {string} timestamp
 */
async function persistActivityLogs(entries, timestamp) {
  for (const entry of entries) {
    // Null orphaned session uids so activity logging never trips users FK.
    await query(
      `INSERT INTO activity_logs (uid, email, session_id, event_type, path, meta, ip, created_at)
       VALUES (
         (SELECT id FROM users WHERE id = $1::uuid),
         $2, $3, $4, $5, $6::jsonb, $7::inet, $8::timestamptz
       )`,
      [
        entry.uid,
        entry.email,
        entry.sessionId,
        entry.eventType,
        entry.path,
        JSON.stringify(entry.meta || {}),
        entry.ip === "unknown" ? null : entry.ip,
        timestamp,
      ],
    );
  }
}
