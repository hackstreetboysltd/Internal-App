export const ENC_VERSION = 4;
export const PBKDF2_ITERATIONS = 210000;
export const VAULT_STORAGE_PREFIX = "messages.vault.";
export const DEFAULT_CHANNEL = "general";
export const DIRECT_CHANNEL = "direct";
export const CHANNELS = [
    { id: "general", label: "General", hint: "Team announcements" },
    { id: "credentials", label: "Credentials", hint: "Secrets and access" },
    { id: "leadership", label: "Leadership", hint: "Restricted leadership notes" },
    { id: "direct", label: "Direct", hint: "Sealed to selected teammates" },
];
export const ECDH_ALG = { name: "ECDH", namedCurve: "P-256" };
export const ECDH_WRAP_INFO = "CX-MSG-ECDH-v1";
export const IDENTITY_PREFIX = "messages.identity.";
export const DECRYPT_MISMATCH = "[Decryption Key Mismatch]";
export const DECRYPT_INVALID = "[Invalid Cipher Block]";
export const NOT_ADDRESSED = "[Not addressed to you]";
export const LOCKED_PLACEHOLDER = "[Locked]";

const vaultByChannel = {};
const wrapKeyCache = new Map();
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

export function isPskWrap(w) {
    return !!(w && typeof w.iv === "string" && typeof w.key === "string" && w.type !== "ecdh");
}

export function isEcdhWrap(w) {
    return !!(w && w.type === "ecdh" && typeof w.iv === "string" && typeof w.key === "string" && w.ephPub);
}

export function isEnvelopeMessage(m) {
    if (Number(m && m.enc) !== ENC_VERSION) return false;
    if (typeof m.cipher !== "string" || typeof m.iv !== "string") return false;
    if (!Array.isArray(m.wrappedKeys) || !m.wrappedKeys.length) return false;
    if (!m.wrappedKeys.every((w) => isPskWrap(w) || isEcdhWrap(w))) return false;
    const hasPsk = m.wrappedKeys.some(isPskWrap);
    const hasEcdh = m.wrappedKeys.some(isEcdhWrap);
    if (hasPsk && hasEcdh) return false;
    if (hasPsk && typeof m.salt !== "string") return false;
    return true;
}

export function normalizeChannel(id) {
    return CHANNELS.some((c) => c.id === id) ? id : DEFAULT_CHANNEL;
}

export function channelMeta(id) {
    const key = normalizeChannel(id);
    return CHANNELS.find((c) => c.id === key);
}

export function messageChannel(m) {
    return normalizeChannel(m && m.channel);
}

export function isDirectMessage(m) {
    return messageChannel(m) === DIRECT_CHANNEL || (m.wrappedKeys || []).some(isEcdhWrap);
}

export function getVaultPassphrase(channel) {
    const id = normalizeChannel(channel);
    if (vaultByChannel[id]) return vaultByChannel[id];
    try {
        vaultByChannel[id] = sessionStorage.getItem(VAULT_STORAGE_PREFIX + id) || null;
    } catch {
        vaultByChannel[id] = null;
    }
    return vaultByChannel[id];
}

export function setVaultPassphrase(passphrase, channel) {
    const id = normalizeChannel(channel);
    const next = passphrase || null;
    if (vaultByChannel[id] !== next) wrapKeyCache.clear();
    vaultByChannel[id] = next;
    try {
        if (next) sessionStorage.setItem(VAULT_STORAGE_PREFIX + id, next);
        else sessionStorage.removeItem(VAULT_STORAGE_PREFIX + id);
    } catch {
        /* sessionStorage may be unavailable */
    }
}

export function clearWrapKeyCache() {
    wrapKeyCache.clear();
}

function identityStorageKey(email) {
    return IDENTITY_PREFIX + (email || "").trim().toLowerCase();
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
            identityKeys = {
                publicJwk: parsed.publicJwk,
                privateKey: await importEcdhPrivate(parsed.privateJwk),
                publicKey: await importEcdhPublic(parsed.publicJwk),
            };
            return identityKeys;
        }
    } catch (e) {
        console.warn("Could not restore device key:", e);
    }
    const pair = await crypto.subtle.generateKey(ECDH_ALG, true, ["deriveBits"]);
    const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
    const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
    delete publicJwk.d;
    try {
        localStorage.setItem(identityStorageKey(key), JSON.stringify({ publicJwk, privateJwk }));
    } catch (e) {
        console.warn("Could not persist device key:", e);
    }
    identityKeys = { publicJwk, privateKey: pair.privateKey, publicKey: pair.publicKey };
    return identityKeys;
}

async function deriveEcdhWrapKey(sharedBits, saltBytes, usage) {
    const hkdfKey = await crypto.subtle.importKey("raw", sharedBits, "HKDF", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
        { name: "HKDF", hash: "SHA-256", salt: saltBytes, info: new TextEncoder().encode(ECDH_WRAP_INFO) },
        hkdfKey,
        { name: "AES-GCM", length: 256 },
        false,
        usage,
    );
}

async function ecdhWrapMessageKey(messageKeyBytes, recipientPubJwk) {
    const eph = await crypto.subtle.generateKey(ECDH_ALG, true, ["deriveBits"]);
    const recipientPub = await importEcdhPublic(recipientPubJwk);
    const shared = await crypto.subtle.deriveBits({ name: "ECDH", public: recipientPub }, eph.privateKey, 256);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const wrapKey = await deriveEcdhWrapKey(shared, salt, ["encrypt"]);
    const wrapped = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, wrapKey, messageKeyBytes);
    const ephPub = await crypto.subtle.exportKey("jwk", eph.publicKey);
    delete ephPub.d;
    return {
        type: "ecdh",
        iv: bytesToB64(iv),
        salt: bytesToB64(salt),
        key: bytesToB64(new Uint8Array(wrapped)),
        ephPub,
    };
}

async function ecdhUnwrapMessageKey(wrap, privateKey) {
    const ephPub = await importEcdhPublic(wrap.ephPub);
    const shared = await crypto.subtle.deriveBits({ name: "ECDH", public: ephPub }, privateKey, 256);
    const wrapKey = await deriveEcdhWrapKey(shared, b64ToBytes(wrap.salt), ["decrypt"]);
    return crypto.subtle.decrypt({ name: "AES-GCM", iv: b64ToBytes(wrap.iv) }, wrapKey, b64ToBytes(wrap.key));
}

export async function encryptDirectEnvelope(plaintext, recipients, email) {
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
    for (const r of recipients) {
        const recipEmail = (r.email || "").trim().toLowerCase();
        if (!recipEmail || seen.has(recipEmail) || !r.msgPub) continue;
        seen.add(recipEmail);
        const wrap = await ecdhWrapMessageKey(messageKeyBytes, r.msgPub);
        wrap.email = recipEmail;
        wrappedKeys.push(wrap);
        to.push(recipEmail);
    }
    if (!wrappedKeys.length) throw new Error("No recipients with a device key");
    return {
        enc: ENC_VERSION,
        cipher: bytesToB64(new Uint8Array(cipherBuf)),
        iv: bytesToB64(bodyIv),
        to,
        wrappedKeys,
    };
}

export async function decryptDirectEnvelope(m, email) {
    try {
        const identity = await loadIdentity(email);
        if (!identity) return NOT_ADDRESSED;
        const key = (email || "").trim().toLowerCase();
        const wraps = (m.wrappedKeys || []).filter((w) => isEcdhWrap(w) && (w.email || "").toLowerCase() === key);
        if (!wraps.length) return NOT_ADDRESSED;
        for (const wrap of wraps) {
            try {
                const messageKeyBytes = await ecdhUnwrapMessageKey(wrap, identity.privateKey);
                const messageKey = await crypto.subtle.importKey("raw", messageKeyBytes, { name: "AES-GCM" }, false, ["decrypt"]);
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

async function deriveWrapKey(passphrase, saltBytes, saltB64) {
    const cached = wrapKeyCache.get(saltB64);
    if (cached) return cached;
    const material = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(passphrase),
        "PBKDF2",
        false,
        ["deriveKey"],
    );
    const key = await crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: saltBytes, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
        material,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"],
    );
    wrapKeyCache.set(saltB64, key);
    return key;
}

export async function encryptEnvelope(plaintext, passphrase) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const bodyIv = crypto.getRandomValues(new Uint8Array(12));
    const wrapIv = crypto.getRandomValues(new Uint8Array(12));
    const messageKeyBytes = crypto.getRandomValues(new Uint8Array(32));

    const messageKey = await crypto.subtle.importKey(
        "raw",
        messageKeyBytes,
        { name: "AES-GCM" },
        false,
        ["encrypt"],
    );
    const wrapKey = await deriveWrapKey(passphrase, salt, bytesToB64(salt));
    const cipherBuf = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: bodyIv },
        messageKey,
        new TextEncoder().encode(plaintext),
    );
    const wrappedKeyBuf = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: wrapIv },
        wrapKey,
        messageKeyBytes,
    );

    return {
        enc: ENC_VERSION,
        cipher: bytesToB64(new Uint8Array(cipherBuf)),
        iv: bytesToB64(bodyIv),
        salt: bytesToB64(salt),
        wrappedKeys: [{
            type: "psk",
            iv: bytesToB64(wrapIv),
            key: bytesToB64(new Uint8Array(wrappedKeyBuf)),
        }],
    };
}

export async function decryptEnvelope(m, passphrase) {
    try {
        const wrap = m.wrappedKeys && m.wrappedKeys[0];
        if (!wrap || !m.iv || !m.salt || !m.cipher) return DECRYPT_INVALID;
        const salt = b64ToBytes(m.salt);
        const wrapKey = await deriveWrapKey(passphrase, salt, m.salt);
        const messageKeyBytes = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: b64ToBytes(wrap.iv) },
            wrapKey,
            b64ToBytes(wrap.key),
        );
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
        return DECRYPT_MISMATCH;
    }
}

export async function decryptMessage(m, passphrase, email) {
    if (!isEnvelopeMessage(m)) return DECRYPT_INVALID;
    if (isDirectMessage(m)) return decryptDirectEnvelope(m, email);
    if (!passphrase) return DECRYPT_MISMATCH;
    return decryptEnvelope(m, passphrase);
}
