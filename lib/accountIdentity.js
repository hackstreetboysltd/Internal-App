export const MSG_IDENTITY_ENC_FIELD = "msgIdentityEnc";

/**
 * @param {unknown} parsed
 */
export function isPersistedIdentity(parsed) {
  return !!(
    parsed
    && typeof parsed === "object"
    && Number(/** @type {{ format?: unknown }} */ (parsed).format) === 2
    && /** @type {{ publicJwk?: unknown }} */ (parsed).publicJwk
    && /** @type {{ privateJwk?: unknown }} */ (parsed).privateJwk
    && typeof /** @type {{ mlkemPublic?: unknown }} */ (parsed).mlkemPublic === "string"
    && /** @type {{ mlkemPublic: string }} */ (parsed).mlkemPublic
    && typeof /** @type {{ mlkemSecret?: unknown }} */ (parsed).mlkemSecret === "string"
    && /** @type {{ mlkemSecret: string }} */ (parsed).mlkemSecret
  );
}

/**
 * @param {unknown} a
 * @param {unknown} b
 */
export function persistedIdentitiesMatch(a, b) {
  if (!isPersistedIdentity(a) || !isPersistedIdentity(b)) return false;
  const left = /** @type {{ mlkemPublic: string, publicJwk?: { x?: string, y?: string } }} */ (a);
  const right = /** @type {{ mlkemPublic: string, publicJwk?: { x?: string, y?: string } }} */ (b);
  return (
    left.mlkemPublic === right.mlkemPublic
    && left.publicJwk?.x === right.publicJwk?.x
    && left.publicJwk?.y === right.publicJwk?.y
  );
}

/**
 * After login, the account key wins. A new origin only uploads if it can
 * already unlock mail (or there is no mail yet). That stops production
 * localStorage from overwriting the key that sealed existing threads.
 *
 * @param {{
 *   hasAccountIdentity: boolean,
 *   existingMail: boolean,
 *   localUnlocksMail: boolean,
 *   inboxUnreliable?: boolean,
 * }} input
 * @returns {"install-account" | "upload-local" | "wait-for-account"}
 */
export function accountIdentityPlan(input) {
  if (input && input.hasAccountIdentity) return "install-account";
  if (input && input.localUnlocksMail) return "upload-local";
  if (input && input.inboxUnreliable) return "wait-for-account";
  if (!input || !input.existingMail) return "upload-local";
  return "wait-for-account";
}

/**
 * @param {string} collectionName
 * @param {unknown} item
 */
export function sanitizeItemForClient(collectionName, item) {
  if (collectionName === "profile") return stripMsgIdentityEnc(item);
  return item;
}

/**
 * @param {unknown} item
 */
export function stripMsgIdentityEnc(item) {
  if (!item || typeof item !== "object" || !(MSG_IDENTITY_ENC_FIELD in item)) return item;
  const next = { ...item };
  delete next[MSG_IDENTITY_ENC_FIELD];
  return next;
}

/**
 * Profile collection writes must never create or rotate the private blob.
 * Only `/api/messages/identity` writes `msgIdentityEnc`.
 *
 * @param {Record<string, unknown> | null | undefined} oldItem
 * @param {Record<string, unknown>} incoming
 */
export function pinMsgIdentityEnc(oldItem, incoming) {
  const next = { ...(oldItem || {}), ...incoming };
  if (oldItem && oldItem[MSG_IDENTITY_ENC_FIELD] != null) {
    next[MSG_IDENTITY_ENC_FIELD] = oldItem[MSG_IDENTITY_ENC_FIELD];
  } else {
    delete next[MSG_IDENTITY_ENC_FIELD];
  }
  return next;
}
