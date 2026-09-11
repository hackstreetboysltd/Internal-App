import { MSG_IDENTITY_ENC_FIELD, isPersistedIdentity, persistedIdentitiesMatch } from "@/lib/accountIdentity";
import { normalizeEmail } from "@/lib/normalize";
import {
  CollectionSaveError,
  getCollectionItem,
  listCollectionItems,
  replaceCollectionItemsAtomic,
} from "@/lib/server/collectionsDb";
import { unwrapMessageIdentity, wrapMessageIdentity } from "@/lib/server/messageIdentityCrypto";

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
 * @param {string} email
 */
export async function readOwnerMessageIdentity(email) {
  const profile = await findOwnerProfile(email);
  if (!profile || profile[MSG_IDENTITY_ENC_FIELD] == null) return null;
  try {
    return unwrapMessageIdentity(profile[MSG_IDENTITY_ENC_FIELD]);
  } catch {
    console.warn("Could not unwrap account message identity");
    return null;
  }
}

/**
 * First write wins unless `replace` (explicit import). Same key is a no-op.
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
        try {
          existing = unwrapMessageIdentity(existingEnc);
        } catch {
          existing = null;
        }
        if (existing && persistedIdentitiesMatch(existing, identity)) {
          return oldItems;
        }
        if (existing) {
          const err = new CollectionSaveError("Account identity already exists", 409);
          err.existingIdentity = existing;
          throw err;
        }
        // Corrupt or unwrap-failed blob (e.g. SESSION_SECRET rotated) — rewrite.
      }
      const next = oldItems.slice();
      next[idx] = {
        ...row,
        [MSG_IDENTITY_ENC_FIELD]: wrapMessageIdentity(identity),
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
