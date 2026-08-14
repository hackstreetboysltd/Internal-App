import { randomUUID } from "crypto";
import { getSessionRotateAfterSec, getSessionTtlSec } from "@/lib/server/constants";
import { getRedis } from "@/lib/server/redis";

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
  const redis = getRedis();
  if (redis.status !== "ready") {
    await redis.connect();
  }
  return redis;
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
  const now = new Date().toISOString();
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
    return JSON.parse(raw);
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

  session.lastSeenAt = new Date().toISOString();
  const ttl = getSessionTtlSec();
  const redis = await redisReady();
  await redis.setex(`${SESSION_PREFIX}${sid}`, ttl, JSON.stringify(session));
  await indexSession(session.uid, session.sid, ttl);
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

  await destroySession(oldSid);
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
  return Date.now() - created >= after * 1000;
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
 * @param {Partial<{ needsProfileSync: boolean }>} patch
 */
export async function patchSession(sid, patch) {
  const session = await getSession(sid);
  if (!session) return null;

  Object.assign(session, patch);
  session.lastSeenAt = new Date().toISOString();

  const ttl = getSessionTtlSec();
  const redis = await redisReady();
  await redis.setex(`${SESSION_PREFIX}${sid}`, ttl, JSON.stringify(session));
  await indexSession(session.uid, session.sid, ttl);
  return session;
}
