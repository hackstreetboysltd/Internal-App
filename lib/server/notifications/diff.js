/**
 * @param {unknown} a
 * @param {unknown} b
 */
export function valuesEqual(a, b) {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a == b) {
    if ((typeof a === "string" || typeof a === "number") && (typeof b === "string" || typeof b === "number")) {
      return String(a) === String(b);
    }
  }
  if (typeof a !== typeof b) return false;
  if (a && typeof a === "object" && b && typeof b === "object") {
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i += 1) {
        if (!valuesEqual(a[i], b[i])) return false;
      }
      return true;
    }
    if (Array.isArray(a) || Array.isArray(b)) return false;
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    for (const key of keysA) {
      if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
      if (!valuesEqual(a[key], b[key])) return false;
    }
    return true;
  }
  return false;
}

/**
 * @param {unknown[]} oldItems
 * @param {unknown[]} newItems
 * @returns {{
 *   created: Record<string, unknown>[],
 *   updated: { old: Record<string, unknown>, new: Record<string, unknown> }[],
 *   deleted: Record<string, unknown>[],
 * }}
 */
export function diffCollection(oldItems, newItems) {
  const oldList = Array.isArray(oldItems) ? oldItems : [];
  const newList = Array.isArray(newItems) ? newItems : [];
  /** @type {Map<string, Record<string, unknown>>} */
  const oldMap = new Map();
  /** @type {Map<string, Record<string, unknown>>} */
  const newMap = new Map();

  for (const item of oldList) {
    if (!item || typeof item !== "object") continue;
    oldMap.set(String(item.id), item);
  }
  for (const item of newList) {
    if (!item || typeof item !== "object") continue;
    newMap.set(String(item.id), item);
  }

  /** @type {Record<string, unknown>[]} */
  const created = [];
  /** @type {{ old: Record<string, unknown>, new: Record<string, unknown> }[]} */
  const updated = [];
  /** @type {Record<string, unknown>[]} */
  const deleted = [];

  for (const [id, item] of newMap) {
    if (!oldMap.has(id)) {
      created.push(item);
    } else if (!valuesEqual(oldMap.get(id), item)) {
      updated.push({ old: oldMap.get(id), new: item });
    }
  }
  for (const [id, item] of oldMap) {
    if (!newMap.has(id)) deleted.push(item);
  }

  return { created, updated, deleted };
}

/**
 * @param {unknown[]} oldPending
 * @param {unknown[]} newPending
 * @returns {Record<string, unknown>[]} newly queued pending entries
 */
export function diffPendingEntries(oldPending, newPending) {
  const oldList = Array.isArray(oldPending) ? oldPending : [];
  const newList = Array.isArray(newPending) ? newPending : [];
  /** @type {Map<string, Record<string, unknown>>} */
  const oldMap = new Map();
  for (const entry of oldList) {
    if (!entry || typeof entry !== "object") continue;
    oldMap.set(`${entry.type}:${entry.id}`, entry);
  }
  /** @type {Record<string, unknown>[]} */
  const added = [];
  for (const entry of newList) {
    if (!entry || typeof entry !== "object") continue;
    const key = `${entry.type}:${entry.id}`;
    if (!oldMap.has(key)) added.push(entry);
  }
  return added;
}

/**
 * @param {Record<string, unknown>} oldItem
 * @param {Record<string, unknown>} newItem
 * @returns {Record<string, unknown>[]}
 */
export function diffNestedDocuments(oldItem, newItem) {
  const oldDocs = Array.isArray(oldItem.documents) ? oldItem.documents : [];
  const newDocs = Array.isArray(newItem.documents) ? newItem.documents : [];
  /** @type {Map<string, Record<string, unknown>>} */
  const oldMap = new Map(oldDocs.map((doc) => [String(doc.id), doc]));
  /** @type {Record<string, unknown>[]} */
  const added = [];
  for (const doc of newDocs) {
    if (!doc || typeof doc !== "object") continue;
    if (!oldMap.has(String(doc.id))) added.push(doc);
  }
  return added;
}

/**
 * @param {Record<string, unknown>} oldItem
 * @param {Record<string, unknown>} newItem
 */
export function isDocumentsOnlyChange(oldItem, newItem) {
  const keys = new Set([...Object.keys(oldItem || {}), ...Object.keys(newItem || {})]);
  for (const key of keys) {
    if (key === "documents") continue;
    if (!valuesEqual(oldItem?.[key], newItem?.[key])) return false;
  }
  return !valuesEqual(oldItem?.documents, newItem?.documents);
}
