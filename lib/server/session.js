import { randomUUID } from "crypto";
import { getSessionRotateAfterSec, getSessionTtlSec } from "@/lib/server/constants";
import { ensureRedisConnected } from "@/lib/server/redis";
import { realNowIso, realNowMs } from "@/lib/server/realTime";

const SESSION_PREFIX = "session:";
const USER_SESSIONS_PREFIX = "user_sessions:";
const SID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * @param {string | undefined | null} sid
 */
export function isValidSid(sid) {
  return typeof sid === "string" && SID_RE.test(sid);
}

async function redisReady() {
  return ensureRedisConnected();
}

/**
 * @param {string} uid
 * @param {string} sid
 * @param {number} ttl
 */
async function indexSession(uid, sid, ttl) {
  if (!uid) return;
  const redis = await redisReady();
  await redis.sadd(`${USER_SESSIONS_PREFIX}${uid}`, sid);
  await redis.expire(`${USER_SESSIONS_PREFIX}${uid}`, ttl);
}

/**
 * @param {string} uid
 * @param {string} sid
 */
async function unindexSession(uid, sid) {
  if (!uid) return;
  const redis = await redisReady();
  await redis.srem(`${USER_SESSIONS_PREFIX}${uid}`, sid);
}

/**
 * @param {{
 *   uid: string,
 *   email: string,
 *   name: string,
 *   avatar?: string,
 *   roles?: string[],
 *   sessionId?: string,
 *   needsProfileSync?: boolean,
 * }} input
 */
export async function createSession(input) {
  const sid = randomUUID();
  const now = realNowIso();
  const payload = {
    sid,
    uid: input.uid,
    email: input.email,
    name: input.name,
    avatar: input.avatar || "",
    roles: input.roles || ["user"],
    sessionId: input.sessionId || "",
    createdAt: now,
    lastSeenAt: now,
    needsProfileSync: input.needsProfileSync === true,
  };

  const ttl = getSessionTtlSec();
  const redis = await redisReady();
  await redis.setex(`${SESSION_PREFIX}${sid}`, ttl, JSON.stringify(payload));
  await indexSession(input.uid, sid, ttl);

  return { sid, session: payload };
}

/**
 * @param {string | undefined | null} sid
 */
export async function getSession(sid) {
  if (!sid || !isValidSid(sid)) return null;

  const redis = await redisReady();
  const raw = await redis.get(`${SESSION_PREFIX}${sid}`);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    // During rotation, the old sid is kept briefly and points at the new one.
    if (parsed._rotatedTo && isValidSid(parsed._rotatedTo)) {
      return getSession(parsed._rotatedTo);
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Sliding TTL refresh on authenticated activity.
 * @param {string | undefined | null} sid
 */
export async function touchSession(sid) {
  const session = await getSession(sid);
  if (!session) return null;

  session.lastSeenAt = realNowIso();
  const ttl = getSessionTtlSec();
  const redis = await redisReady();
  await redis.setex(`${SESSION_PREFIX}${sid}`, ttl, JSON.stringify(session));
  await indexSession(session.uid, session.sid, ttl);
  return session;
}

const TOUCH_WRITE_INTERVAL_MS = 30_000;
/** @type {Map<string, number>} */
const lastTouchWriteAt = new Map();

/**
 * Read session and extend TTL, but skip Redis writes on hot read paths when recently touched.
 * @param {string | undefined | null} sid
 * @param {{ force?: boolean }} [options]
 */
export async function touchSessionThrottled(sid, { force = false } = {}) {
  if (!force) {
    const session = await getSession(sid);
    if (!session) return null;
    const lastWrite = lastTouchWriteAt.get(sid) || 0;
    if (Date.now() - lastWrite < TOUCH_WRITE_INTERVAL_MS) {
      return session;
    }
  }

  const session = await touchSession(sid);
  if (session?.sid) {
    lastTouchWriteAt.set(session.sid, Date.now());
  }
  return session;
}

/**
 * @param {string | undefined | null} sid
 */
export async function destroySession(sid) {
  if (!sid || !isValidSid(sid)) return false;

  const session = await getSession(sid);
  const redis = await redisReady();
  const deleted = await redis.del(`${SESSION_PREFIX}${sid}`);
  if (session?.uid) {
    await unindexSession(session.uid, sid);
  }
  return deleted > 0 || !!session;
}

/**
 * @param {string} uid
 */
export async function destroySessionsForUser(uid) {
  if (!uid) return 0;
  const redis = await redisReady();
  const sids = await redis.smembers(`${USER_SESSIONS_PREFIX}${uid}`);
  let killed = 0;
  for (const sid of sids) {
    if (await destroySession(sid)) killed += 1;
  }
  await redis.del(`${USER_SESSIONS_PREFIX}${uid}`);
  return killed;
}

/**
 * Issue a new sid, copy the payload, and drop the old key.
 * @param {string} oldSid
 */
export async function rotateSession(oldSid) {
  const old = await getSession(oldSid);
  if (!old) return null;

  const created = await createSession({
    uid: old.uid,
    email: old.email,
    name: old.name,
    avatar: old.avatar,
    roles: old.roles,
    sessionId: old.sessionId,
    needsProfileSync: old.needsProfileSync === true,
  });

  // Keep the old sid valid briefly so parallel in-flight requests don't 401.
  const redis = await redisReady();
  await redis.setex(
    `${SESSION_PREFIX}${oldSid}`,
    120,
    JSON.stringify({ _rotatedTo: created.sid }),
  );

  return created;
}

/**
 * Rotate when the session is older than SESSION_ROTATE_AFTER_SEC.
 * @param {Record<string, unknown>} session
 */
export function sessionNeedsRotation(session) {
  const after = getSessionRotateAfterSec();
  if (!after || !session?.createdAt) return false;
  const created = new Date(String(session.createdAt)).getTime();
  if (!Number.isFinite(created)) return false;
  return realNowMs() - created >= after * 1000;
}

/**
 * @param {string} uid
 */
export async function listSessionsForUid(uid) {
  if (!uid) return [];
  const redis = await redisReady();
  const sids = await redis.smembers(`${USER_SESSIONS_PREFIX}${uid}`);
  /** @type {Record<string, unknown>[]} */
  const sessions = [];
  for (const sid of sids) {
    const session = await getSession(sid);
    if (session) sessions.push(session);
    else await unindexSession(uid, sid);
  }
  return sessions;
}

/**
 * @param {string} sid
 * @param {Partial<{ needsProfileSync: boolean, roles: string[] }>} patch
 */
export async function patchSession(sid, patch) {
  const session = await getSession(sid);
  if (!session) return null;

  Object.assign(session, patch);
  session.lastSeenAt = realNowIso();

  const ttl = getSessionTtlSec();
  const redis = await redisReady();
  await redis.setex(`${SESSION_PREFIX}${sid}`, ttl, JSON.stringify(session));
  await indexSession(session.uid, session.sid, ttl);
  return session;
}
