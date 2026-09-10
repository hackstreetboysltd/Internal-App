/** Record visibility: A = admin (+ author); B = all allowlisted users (default). */

export const SECURITY_LEVEL_A = "A";
export const SECURITY_LEVEL_B = "B";
export const DEFAULT_SECURITY_LEVEL = SECURITY_LEVEL_B;

export const SECURITY_LEVEL_OPTIONS = [
  {
    value: SECURITY_LEVEL_B,
    label: "B — General view",
    cardLabel: "General view",
    hint: "Everyone on the portal",
  },
  {
    value: SECURITY_LEVEL_A,
    label: "A — Admin view",
    cardLabel: "Admins and you",
    hint: "Hidden from general view",
  },
];

/** Collections that enforce record-level A/B visibility. Disabled — access is admin vs user only. */
export const SECURITY_LEVEL_COLLECTIONS = new Set([]);

/**
 * @param {string | null | undefined} collectionName
 */
export function collectionUsesSecurityLevel(collectionName) {
  return SECURITY_LEVEL_COLLECTIONS.has(String(collectionName || ""));
}

/**
 * @param {unknown} value
 * @returns {"A" | "B"}
 */
export function normalizeSecurityLevel(value) {
  const raw = String(value || "")
    .trim()
    .toUpperCase();
  if (raw === SECURITY_LEVEL_A || raw === "A-LEVEL" || raw === "ADMIN") {
    return SECURITY_LEVEL_A;
  }
  return SECURITY_LEVEL_B;
}

/**
 * Resolve security level from a record or pending wrapper (`data` nested).
 * @param {unknown} item
 * @returns {"A" | "B"}
 */
export function securityLevelOf(item) {
  if (!item || typeof item !== "object") return DEFAULT_SECURITY_LEVEL;
  const row = /** @type {Record<string, unknown>} */ (item);
  if (row.securityLevel != null && row.securityLevel !== "") {
    return normalizeSecurityLevel(row.securityLevel);
  }
  const nested = row.data;
  if (nested && typeof nested === "object" && "securityLevel" in nested) {
    return normalizeSecurityLevel(
      /** @type {Record<string, unknown>} */ (nested).securityLevel,
    );
  }
  return DEFAULT_SECURITY_LEVEL;
}

/**
 * @param {unknown} item
 * @returns {string}
 */
export function recordAuthorEmail(item) {
  if (!item || typeof item !== "object") return "";
  const row = /** @type {Record<string, unknown>} */ (item);
  const nested =
    row.data && typeof row.data === "object"
      ? /** @type {Record<string, unknown>} */ (row.data)
      : null;
  const candidates = [
    row.email,
    row.authorEmail,
    row.createdByEmail,
    row.author_email,
    nested && nested.email,
    nested && nested.authorEmail,
    nested && nested.createdByEmail,
    nested && nested.author_email,
  ];
  for (const c of candidates) {
    const email = String(c || "")
      .trim()
      .toLowerCase();
    if (email && email.includes("@")) return email;
  }
  return "";
}

/**
 * @param {unknown} item
 * @returns {string}
 */
export function recordAuthorName(item) {
  if (!item || typeof item !== "object") return "";
  const row = /** @type {Record<string, unknown>} */ (item);
  const nested =
    row.data && typeof row.data === "object"
      ? /** @type {Record<string, unknown>} */ (row.data)
      : null;
  const candidates = [
    row.author,
    row.user,
    row.createdBy,
    nested && nested.author,
    nested && nested.user,
    nested && nested.createdBy,
  ];
  for (const c of candidates) {
    const name = String(c || "")
      .trim()
      .toLowerCase();
    if (name) return name;
  }
  return "";
}

/**
 * @param {"A" | "B" | string | null | undefined} level
 */
export function securityLevelLabel(level) {
  const normalized = normalizeSecurityLevel(level);
  const opt = SECURITY_LEVEL_OPTIONS.find((o) => o.value === normalized);
  return opt ? opt.label : SECURITY_LEVEL_OPTIONS[0].label;
}
