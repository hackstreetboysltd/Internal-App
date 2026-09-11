import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";

export const ENC_VERSION = 5;
export const DEFAULT_CHANNEL = "direct";
export const DIRECT_CHANNEL = "direct";
/** Static fallback — Messages prefers live channels from the channels collection. */
export const CHANNELS = [
    { id: "direct", label: "Direct", hint: "Sealed to selected teammates" },
];
export const ECDH_ALG = { name: "ECDH", namedCurve: "P-256" };
export const HYBRID_WRAP_INFO = "CX-MSG-HYBRID-v1";
export const IDENTITY_PREFIX = "messages.identity.";
export const IDENTITY_FORMAT = 2;
export const IDENTITY_BACKUP_KIND = "cx-msg-identity";
export const IDENTITY_BACKUP_VERSION = 1;
export const DECRYPT_MISMATCH = "[Decryption Key Mismatch]";
export const DECRYPT_INVALID = "[Invalid Cipher Block]";
export const NOT_ADDRESSED = "[Not addressed to you]";
export const LOCKED_PLACEHOLDER = "[Locked]";

/** @deprecated Vault passphrases removed in enc v5. */
export const VAULT_STORAGE_PREFIX = "messages.vault.";

let identityKeys = null;
let identityEmail = "";

export function bytesToB64(bytes) {
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
}

export function b64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

/**
 * Normalize profile.msgPub to { ecdh, mlkem } or null.
 * @param {unknown} msgPub
 */
export function normalizeMsgPub(msgPub) {
    if (!msgPub || typeof msgPub !== "object") return null;
    const row = /** @type {Record<string, unknown>} */ (msgPub);
    if (row.ecdh && typeof row.ecdh === "object" && typeof row.mlkem === "string" && row.mlkem) {
        return {
            ecdh: /** @type {JsonWebKey} */ (row.ecdh),
            mlkem: String(row.mlkem),
        };
    }
    // Legacy bare ECDH JWK — not usable for hybrid wraps
    if (row.kty === "EC" && row.crv === "P-256" && row.x && row.y) {
        return null;
    }
    return null;
}

export function isHybridWrap(w) {
    return !!(
        w &&
        w.type === "hybrid" &&
        typeof w.iv === "string" &&
        typeof w.key === "string" &&
        typeof w.salt === "string" &&
        typeof w.kemCt === "string" &&
        w.ephPub
    );
}

export function isEnvelopeMessage(m) {
    if (Number(m && m.enc) !== ENC_VERSION) return false;
    if (typeof m.cipher !== "string" || typeof m.iv !== "string") return false;
    if (!Array.isArray(m.wrappedKeys) || !m.wrappedKeys.length) return false;
    return m.wrappedKeys.every(isHybridWrap);
}

/** Persistable ciphertext row, including wrap-redacted copies (empty wrappedKeys). */
export function isCipherRecord(m) {
    if (Number(m && m.enc) !== ENC_VERSION) return false;
    if (typeof m.cipher !== "string" || typeof m.iv !== "string") return false;
    return Array.isArray(m.wrappedKeys);
}

/**
 * For yourself, always wrap to this browser's live key. Profile.msgPub can be
 * stale after a new device/localStorage, which used to make your own mail
 * decrypt as a mismatch.
 * @param {unknown} profilePub
 * @param {{ isSelf?: boolean, identityPub?: unknown }} [opts]
 */
export function resolveRecipientMsgPub(profilePub, opts = {}) {
    if (opts.isSelf) {
        const live = normalizeMsgPub(opts.identityPub);
        if (live) return live;
    }
    return normalizeMsgPub(profilePub);
}

/**
 * @param {string | null | undefined} id
 * @param {Array<{ id: string }> | null | undefined} catalog
 */
export function normalizeChannel(id, catalog = null) {
    const key = String(id || "").trim().toLowerCase();
    if (key === DIRECT_CHANNEL) return DIRECT_CHANNEL;
    if (key.startsWith("dm-")) return key;
    const list = Array.isArray(catalog) ? catalog : null;
    if (list) {
        if (list.some((c) => c && String(c.id) === key)) return key;
        if (list.length && list[0]?.id) return String(list[0].id);
        return DIRECT_CHANNEL;
    }
    return key || DIRECT_CHANNEL;
}

/**
 * @param {string | null | undefined} id
 * @param {Array<{ id: string, label?: string, name?: string, hint?: string, description?: string }> | null | undefined} catalog
 */
export function channelMeta(id, catalog = null) {
    const key = normalizeChannel(id, catalog);
    if (key === DIRECT_CHANNEL) {
        return { id: DIRECT_CHANNEL, label: "Direct", hint: "Sealed to selected teammates" };
    }
    const list = Array.isArray(catalog) ? catalog : [];
    const found = list.find((c) => c && String(c.id) === key);
    if (found) {
        return {
            id: key,
            label: found.label || found.name || key,
            hint: found.hint || found.description || "Channel",
        };
    }
    return { id: key, label: key, hint: "Channel" };
}

export function messageChannel(m, catalog = null) {
    return normalizeChannel(m && m.channel, catalog);
}

export function isDirectMessage(m) {
    return messageChannel(m) === DIRECT_CHANNEL;
}

/** @deprecated No-op — PSK vault removed. */
export function getVaultPassphrase() {
    return null;
}

/** @deprecated No-op — PSK vault removed. */
export function setVaultPassphrase() {}

/** @deprecated No-op — PSK vault removed. */
export function clearWrapKeyCache() {}

function identityStorageKey(email) {
    return IDENTITY_PREFIX + (email || "").trim().toLowerCase();
}

function isPersistedIdentity(parsed) {
    return !!(
        parsed
        && typeof parsed === "object"
        && Number(parsed.format) === IDENTITY_FORMAT
        && parsed.publicJwk
        && parsed.privateJwk
        && typeof parsed.mlkemPublic === "string"
        && parsed.mlkemPublic
        && typeof parsed.mlkemSecret === "string"
        && parsed.mlkemSecret
    );
}

/** Drop the in-memory identity so the next load reads localStorage. */
export function clearIdentityCache() {
    identityKeys = null;
    identityEmail = "";
}

/**
 * Publish a newly generated device key only when the profile has no hybrid
 * msgPub yet, or it already matches this device. Never rotate a published key
 * just because this origin created a fresh localStorage identity.
 * @param {unknown} existing
 * @param {unknown} next
 */
export function shouldPublishDeviceMsgPub(existing, next) {
    const incoming = normalizeMsgPub(next);
    if (!incoming) return false;
    const published = normalizeMsgPub(existing);
    if (!published) return true;
    return (
        published.ecdh?.x === incoming.ecdh?.x
        && published.ecdh?.y === incoming.ecdh?.y
        && published.mlkem === incoming.mlkem
    );
}

/**
 * @param {string} email
 */
export function exportIdentityBackup(email) {
    const key = (email || "").trim().toLowerCase();
    if (!key) throw new Error("Sign in before exporting a device key");
    let raw = null;
    try {
        raw = localStorage.getItem(identityStorageKey(key));
    } catch {
        raw = null;
    }
    if (!raw) throw new Error("No device key on this browser");
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new Error("Device key on this browser is unreadable");
    }
    if (!isPersistedIdentity(parsed)) throw new Error("Device key on this browser cannot be exported");
    return {
        kind: IDENTITY_BACKUP_KIND,
        v: IDENTITY_BACKUP_VERSION,
        email: key,
        identity: parsed,
    };
}

/**
 * @param {string} email
 * @param {unknown} payload
 */
export async function importIdentityBackup(email, payload) {
    const key = (email || "").trim().toLowerCase();
    if (!key) throw new Error("Sign in before importing a device key");
    if (!payload || typeof payload !== "object") throw new Error("Not a device key file");
    const row = /** @type {Record<string, unknown>} */ (payload);
    if (row.kind !== IDENTITY_BACKUP_KIND) throw new Error("Not a device key file");
    if (Number(row.v) !== IDENTITY_BACKUP_VERSION) throw new Error("Unsupported device key file");
    const fileEmail = String(row.email || "").trim().toLowerCase();
    if (fileEmail !== key) throw new Error("This key belongs to a different account");
    if (!isPersistedIdentity(row.identity)) throw new Error("Device key file is incomplete");
    clearIdentityCache();
    try {
        localStorage.setItem(identityStorageKey(key), JSON.stringify(row.identity));
    } catch {
        throw new Error("Could not store the device key in this browser");
    }
    const identity = await loadIdentity(key);
    if (!identity) throw new Error("Imported device key could not be loaded");
    return identity;
}

export function hasLocalIdentity(email) {
    if (identityKeys && identityEmail === (email || "").trim().toLowerCase()) return true;
    try {
        return !!localStorage.getItem(identityStorageKey(email));
    } catch {
        return false;
    }
}

async function importEcdhPublic(jwk) {
    const pub = { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, ext: true };
    return crypto.subtle.importKey("jwk", pub, ECDH_ALG, true, []);
}

async function importEcdhPrivate(jwk) {
    return crypto.subtle.importKey("jwk", jwk, ECDH_ALG, true, ["deriveBits"]);
}

function concatBytes(...parts) {
    const total = parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const p of parts) {
        out.set(p, offset);
        offset += p.length;
    }
    return out;
}

/**
 * Build publishable msgPub from identity.
 * @param {{ publicJwk: JsonWebKey, mlkemPublicB64: string }} identity
 */
export function identityMsgPub(identity) {
    if (!identity?.publicJwk || !identity?.mlkemPublicB64) return null;
    return {
        v: IDENTITY_FORMAT,
        ecdh: identity.publicJwk,
        mlkem: identity.mlkemPublicB64,
    };
}

export async function loadIdentity(email) {
    const key = (email || "").trim().toLowerCase();
    if (!key) return null;
    if (identityKeys && identityEmail === key) return identityKeys;
    identityKeys = null;
    identityEmail = key;

    try {
        const raw = localStorage.getItem(identityStorageKey(key));
        if (raw) {
            const parsed = JSON.parse(raw);
            if (isPersistedIdentity(parsed)) {
                identityKeys = {
                    publicJwk: parsed.publicJwk,
                    privateKey: await importEcdhPrivate(parsed.privateJwk),
                    publicKey: await importEcdhPublic(parsed.publicJwk),
                    mlkemPublic: b64ToBytes(parsed.mlkemPublic),
                    mlkemSecret: b64ToBytes(parsed.mlkemSecret),
                    mlkemPublicB64: parsed.mlkemPublic,
                };
                return identityKeys;
            }
            // Legacy ECDH-only identity — regenerate hybrid keys
        }
    } catch (e) {
        console.warn("Could not restore device key:", e);
    }

    const pair = await crypto.subtle.generateKey(ECDH_ALG, true, ["deriveBits"]);
    const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
    const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
    delete publicJwk.d;
    const mlkem = ml_kem768.keygen();
    const mlkemPublicB64 = bytesToB64(mlkem.publicKey);
    const mlkemSecretB64 = bytesToB64(mlkem.secretKey);

    try {
        localStorage.setItem(
            identityStorageKey(key),
            JSON.stringify({
                format: IDENTITY_FORMAT,
                publicJwk,
                privateJwk,
                mlkemPublic: mlkemPublicB64,
                mlkemSecret: mlkemSecretB64,
            }),
        );
    } catch (e) {
        console.warn("Could not persist device key:", e);
    }

    identityKeys = {
        publicJwk,
        privateKey: pair.privateKey,
        publicKey: pair.publicKey,
        mlkemPublic: mlkem.publicKey,
        mlkemSecret: mlkem.secretKey,
        mlkemPublicB64,
    };
    return identityKeys;
}

async function deriveHybridWrapKey(sharedMaterial, saltBytes, usage) {
    const hkdfKey = await crypto.subtle.importKey("raw", sharedMaterial, "HKDF", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
        { name: "HKDF", hash: "SHA-256", salt: saltBytes, info: new TextEncoder().encode(HYBRID_WRAP_INFO) },
        hkdfKey,
        { name: "AES-GCM", length: 256 },
        false,
        usage,
    );
}

/**
 * @param {Uint8Array} messageKeyBytes
 * @param {{ ecdh: JsonWebKey, mlkem: string }} msgPub
 */
async function hybridWrapMessageKey(messageKeyBytes, msgPub) {
    const eph = await crypto.subtle.generateKey(ECDH_ALG, true, ["deriveBits"]);
    const recipientPub = await importEcdhPublic(msgPub.ecdh);
    const ecdhShared = new Uint8Array(
        await crypto.subtle.deriveBits({ name: "ECDH", public: recipientPub }, eph.privateKey, 256),
    );
    const mlkemPub = b64ToBytes(msgPub.mlkem);
    const { cipherText, sharedSecret } = ml_kem768.encapsulate(mlkemPub);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const material = concatBytes(ecdhShared, sharedSecret);
    const wrapKey = await deriveHybridWrapKey(material, salt, ["encrypt"]);
    const wrapped = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, wrapKey, messageKeyBytes);
    const ephPub = await crypto.subtle.exportKey("jwk", eph.publicKey);
    delete ephPub.d;
    return {
        type: "hybrid",
        iv: bytesToB64(iv),
        salt: bytesToB64(salt),
        key: bytesToB64(new Uint8Array(wrapped)),
        ephPub,
        kemCt: bytesToB64(cipherText),
    };
}

/**
 * @param {object} wrap
 * @param {{ privateKey: CryptoKey, mlkemSecret: Uint8Array }} identity
 */
async function hybridUnwrapMessageKey(wrap, identity) {
    const ephPub = await importEcdhPublic(wrap.ephPub);
    const ecdhShared = new Uint8Array(
        await crypto.subtle.deriveBits({ name: "ECDH", public: ephPub }, identity.privateKey, 256),
    );
    const kemShared = ml_kem768.decapsulate(b64ToBytes(wrap.kemCt), identity.mlkemSecret);
    const material = concatBytes(ecdhShared, kemShared);
    const wrapKey = await deriveHybridWrapKey(material, b64ToBytes(wrap.salt), ["decrypt"]);
    return crypto.subtle.decrypt(
        { name: "AES-GCM", iv: b64ToBytes(wrap.iv) },
        wrapKey,
        b64ToBytes(wrap.key),
    );
}

/**
 * Seal plaintext to recipients that have hybrid msgPub.
 * @param {string} plaintext
 * @param {Array<{ email: string, msgPub?: unknown }>} recipients
 * @param {string} email sender email (ensures identity loaded)
 */
export async function encryptSealedEnvelope(plaintext, recipients, email) {
    await loadIdentity(email);
    const bodyIv = crypto.getRandomValues(new Uint8Array(12));
    const messageKeyBytes = crypto.getRandomValues(new Uint8Array(32));
    const messageKey = await crypto.subtle.importKey("raw", messageKeyBytes, { name: "AES-GCM" }, false, ["encrypt"]);
    const cipherBuf = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: bodyIv },
        messageKey,
        new TextEncoder().encode(plaintext),
    );
    const wrappedKeys = [];
    const to = [];
    const seen = new Set();
    let skipped = 0;
    for (const r of recipients) {
        const recipEmail = (r.email || "").trim().toLowerCase();
        if (!recipEmail || seen.has(recipEmail)) continue;
        const pub = normalizeMsgPub(r.msgPub);
        if (!pub) {
            skipped += 1;
            continue;
        }
        seen.add(recipEmail);
        const wrap = await hybridWrapMessageKey(messageKeyBytes, pub);
        wrap.email = recipEmail;
        wrappedKeys.push(wrap);
        to.push(recipEmail);
    }
    if (!wrappedKeys.length) {
        throw new Error(
            skipped
                ? "No recipients with a hybrid device key (they must open Messages once)"
                : "No recipients with a device key",
        );
    }
    return {
        enc: ENC_VERSION,
        cipher: bytesToB64(new Uint8Array(cipherBuf)),
        iv: bytesToB64(bodyIv),
        to,
        wrappedKeys,
        skippedNoKey: skipped,
    };
}

/** @deprecated Use encryptSealedEnvelope */
export async function encryptDirectEnvelope(plaintext, recipients, email) {
    return encryptSealedEnvelope(plaintext, recipients, email);
}

export async function decryptSealedEnvelope(m, email) {
    try {
        const identity = await loadIdentity(email);
        if (!identity) return NOT_ADDRESSED;
        const key = (email || "").trim().toLowerCase();
        const wraps = (m.wrappedKeys || []).filter(
            (w) => isHybridWrap(w) && (w.email || "").toLowerCase() === key,
        );
        if (!wraps.length) return NOT_ADDRESSED;
        for (const wrap of wraps) {
            try {
                const messageKeyBytes = await hybridUnwrapMessageKey(wrap, identity);
                const messageKey = await crypto.subtle.importKey(
                    "raw",
                    messageKeyBytes,
                    { name: "AES-GCM" },
                    false,
                    ["decrypt"],
                );
                const plainBuf = await crypto.subtle.decrypt(
                    { name: "AES-GCM", iv: b64ToBytes(m.iv) },
                    messageKey,
                    b64ToBytes(m.cipher),
                );
                return new TextDecoder().decode(plainBuf);
            } catch {
                /* try next wrap */
            }
        }
        return DECRYPT_MISMATCH;
    } catch {
        return DECRYPT_MISMATCH;
    }
}

/** @deprecated Use decryptSealedEnvelope */
export async function decryptDirectEnvelope(m, email) {
    return decryptSealedEnvelope(m, email);
}

export async function decryptMessage(m, _passphrase, email) {
    if (!isEnvelopeMessage(m)) return DECRYPT_INVALID;
    return decryptSealedEnvelope(m, email);
}
