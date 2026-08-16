import crypto from "crypto";
import { realNowUnix } from "@/lib/server/realTime";

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not set");
  }
  return secret;
}

/**
 * @param {Record<string, unknown>} payload
 * @returns {string}
 */
export function signState(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", getSecret()).update(data).digest("base64url");
  return `${data}.${sig}`;
}

/**
 * @param {string} token
 * @returns {Record<string, unknown> | null}
 */
export function verifyState(token) {
  if (!token || !token.includes(".")) return null;
  const dot = token.indexOf(".");
  const data = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!data || !sig) return null;

  const expected = crypto.createHmac("sha256", getSecret()).update(data).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
    if (payload.exp && realNowUnix() > Number(payload.exp)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
