import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { isPersistedIdentity } from "@/lib/accountIdentity";

const WRAP_VERSION = 1;
const INFO = "cx-msg-identity-v1";

function wrapKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return createHash("sha256").update(`${INFO}|${secret}`).digest();
}

/**
 * Server-side wrap so a raw DB dump is not the private key in plaintext.
 * The app server can still unwrap — this is account-synced identity, not E2EE
 * against the host.
 *
 * @param {unknown} identity
 */
export function wrapMessageIdentity(identity) {
  if (!isPersistedIdentity(identity)) {
    throw new Error("Invalid message identity");
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", wrapKey(), iv);
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
 */
export function unwrapMessageIdentity(blob) {
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
  const decipher = createDecipheriv("aes-256-gcm", wrapKey(), Buffer.from(row.iv, "base64"));
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
