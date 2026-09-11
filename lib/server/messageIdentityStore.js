import { MSG_IDENTITY_ENC_FIELD, isPersistedIdentity, persistedIdentitiesMatch } from "@/lib/accountIdentity";
import { normalizeEmail } from "@/lib/normalize";
import {
  CollectionSaveError,
  getCollectionItem,
  listCollectionItems,
  replaceCollectionItemsAtomic,
} from "@/lib/server/collectionsDb";
import {
  sessionIdentityWrapKey,
  unwrapMessageIdentityWithKeys,
  wrapMessageIdentity,
} from "@/lib/server/messageIdentityCrypto";
import { getOrCreateDbIdentityWrapKey } from "@/lib/server/messageIdentityWrapKey";

/**
 * @param {string} email
 */
async function findOwnerProfile(email) {
  const needle = normalizeEmail(email);
  if (!needle) return null;
  const byId = await getCollectionItem("profile", needle);
  if (byId && normalizeEmail(byId.email) === needle) return byId;
  const items = await listCollectionItems("profile");
  return items.find((p) => normalizeEmail(p && p.email) === needle) || null;
}

/**
 * Database key first so localhost and Vercel (shared Neon, different
 * SESSION_SECRET) open the same blob. Session secret is fallback for rows
 * written before the shared key existed.
 *
 * @returns {Promise<Array<Buffer>>}
 */
async function wrapKeysForRead() {
  const keys = [];
  try {
    keys.push(await getOrCreateDbIdentityWrapKey());
  } catch (err) {
    console.warn("Could not load database identity wrap key");
  }
  try {
    keys.push(sessionIdentityWrapKey());
  } catch {
    /* SESSION_SECRET unset */
  }
  return keys;
}

/**
 * @param {unknown} blob
 * @returns {Promise<{ identity: object, needsRewrap: boolean } | null>}
 */
async function openWrappedIdentity(blob) {
  const keys = await wrapKeysForRead();
  if (!keys.length) return null;
  try {
    const opened = unwrapMessageIdentityWithKeys(blob, keys);
    return {
      identity: opened.identity,
      needsRewrap: opened.keyIndex > 0,
    };
  } catch {
    console.warn("Could not unwrap account message identity");
    return null;
  }
}

/**
 * @param {string} email
 */
export async function readOwnerMessageIdentity(email) {
  const profile = await findOwnerProfile(email);
  if (!profile || profile[MSG_IDENTITY_ENC_FIELD] == null) return null;
  const opened = await openWrappedIdentity(profile[MSG_IDENTITY_ENC_FIELD]);
  if (!opened) return null;
  if (opened.needsRewrap) {
    try {
      await writeOwnerMessageIdentity(email, opened.identity, { replace: true });
    } catch {
      console.warn("Could not rewrap account message identity for shared-database sync");
    }
  }
  return opened.identity;
}

/**
 * First write wins unless `replace` (explicit import). Same key is a no-op
 * once it is already wrapped with the database key.
 *
 * @param {string} email
 * @param {unknown} identity
 * @param {{ replace?: boolean }} [options]
 */
export async function writeOwnerMessageIdentity(email, identity, options = {}) {
  const actorEmail = normalizeEmail(email);
  if (!actorEmail) {
    throw new CollectionSaveError("Unauthorized", 401);
  }
  if (!isPersistedIdentity(identity)) {
    throw new CollectionSaveError("Invalid identity", 400);
  }

  const dbKey = await getOrCreateDbIdentityWrapKey();
  const readKeys = [dbKey];
  try {
    readKeys.push(sessionIdentityWrapKey());
  } catch {
    /* SESSION_SECRET unset */
  }

  try {
    await replaceCollectionItemsAtomic("profile", actorEmail, (oldItems) => {
      const idx = oldItems.findIndex((p) => normalizeEmail(p && p.email) === actorEmail);
      if (idx === -1) {
        throw new CollectionSaveError("Profile not found", 404);
      }
      const row = oldItems[idx];
      const existingEnc = row && typeof row === "object" ? row[MSG_IDENTITY_ENC_FIELD] : null;
      if (existingEnc && !options.replace) {
        let existing = null;
        let needsRewrap = false;
        try {
          const opened = unwrapMessageIdentityWithKeys(existingEnc, readKeys);
          existing = opened.identity;
          needsRewrap = opened.keyIndex > 0;
        } catch {
          existing = null;
        }
        if (existing && persistedIdentitiesMatch(existing, identity) && !needsRewrap) {
          return oldItems;
        }
        if (existing && !needsRewrap) {
          const err = new CollectionSaveError("Account identity already exists", 409);
          err.existingIdentity = existing;
          throw err;
        }
        // Missing, corrupt, SESSION_SECRET-only, or unwrap-failed blob — rewrite.
      }
      const next = oldItems.slice();
      next[idx] = {
        ...row,
        [MSG_IDENTITY_ENC_FIELD]: wrapMessageIdentity(identity, dbKey),
      };
      return next;
    });
    return { conflict: false, identity };
  } catch (err) {
    if (err instanceof CollectionSaveError && err.status === 409) {
      return { conflict: true, identity: err.existingIdentity || null };
    }
    throw err;
  }
}
