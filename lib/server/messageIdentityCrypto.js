import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { isPersistedIdentity } from "@/lib/accountIdentity";

const WRAP_VERSION = 1;
const INFO = "cx-msg-identity-v1";

/**
 * @param {string} secret
 */
export function deriveIdentityWrapKey(secret) {
  if (!secret) throw new Error("Identity wrap secret is empty");
  return createHash("sha256").update(`${INFO}|${secret}`).digest();
}

/**
 * Legacy wrap key. Local start.sh and Vercel each mint their own
 * SESSION_SECRET, so this cannot sync a shared Neon database.
 */
export function sessionIdentityWrapKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return deriveIdentityWrapKey(secret);
}

/**
 * Server-side wrap so a raw profile dump is not the private key in plaintext.
 * The app server can still unwrap — this is account-synced identity, not E2EE
 * against the host. Pass the database wrap key so every host that shares
 * DATABASE_URL can open the same blob.
 *
 * @param {unknown} identity
 * @param {Buffer | Uint8Array} [keyBytes]
 */
export function wrapMessageIdentity(identity, keyBytes = sessionIdentityWrapKey()) {
  if (!isPersistedIdentity(identity)) {
    throw new Error("Invalid message identity");
  }
  if (!keyBytes || keyBytes.length < 32) {
    throw new Error("Identity wrap key is too short");
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes.subarray(0, 32), iv);
  const plain = Buffer.from(JSON.stringify(identity), "utf8");
  const data = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: WRAP_VERSION,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: data.toString("base64"),
  };
}

/**
 * @param {unknown} blob
 * @param {Buffer | Uint8Array} [keyBytes]
 */
export function unwrapMessageIdentity(blob, keyBytes = sessionIdentityWrapKey()) {
  if (!blob || typeof blob !== "object") {
    throw new Error("Invalid wrapped identity");
  }
  const row = /** @type {{ v?: unknown, iv?: unknown, tag?: unknown, data?: unknown }} */ (blob);
  if (Number(row.v) !== WRAP_VERSION) {
    throw new Error("Unsupported wrapped identity");
  }
  if (typeof row.iv !== "string" || typeof row.tag !== "string" || typeof row.data !== "string") {
    throw new Error("Invalid wrapped identity");
  }
  if (!keyBytes || keyBytes.length < 32) {
    throw new Error("Identity wrap key is too short");
  }
  const decipher = createDecipheriv("aes-256-gcm", keyBytes.subarray(0, 32), Buffer.from(row.iv, "base64"));
  decipher.setAuthTag(Buffer.from(row.tag, "base64"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(row.data, "base64")),
    decipher.final(),
  ]);
  const parsed = JSON.parse(plain.toString("utf8"));
  if (!isPersistedIdentity(parsed)) {
    throw new Error("Unwrapped identity is incomplete");
  }
  return parsed;
}

/**
 * Try wrap keys in order (database key first, SESSION_SECRET last).
 *
 * @param {unknown} blob
 * @param {Array<Buffer | Uint8Array>} keys
 * @returns {{ identity: ReturnType<typeof unwrapMessageIdentity>, keyIndex: number }}
 */
export function unwrapMessageIdentityWithKeys(blob, keys) {
  if (!Array.isArray(keys) || !keys.length) {
    throw new Error("No identity wrap keys");
  }
  let lastErr = /** @type {unknown} */ (new Error("Could not unwrap identity"));
  for (let i = 0; i < keys.length; i += 1) {
    try {
      return { identity: unwrapMessageIdentity(blob, keys[i]), keyIndex: i };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}
