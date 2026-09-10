/** Collections used by the portal (mirrors portalApi list + dynamic calfiles_* / docfiles_*). */
export const KNOWN_COLLECTIONS = [
  "skills",
  "procedures",
  "goals",
  "calendar",
  "meetings",
  "messages",
  "apps",
  "documents",
  "channels",
  "profile",
  "auth",
  "settings",
  "pending_skills",
  "pending_procedures",
  "pending_goals",
  "pending_calendar",
  "pending_meetings",
  "pending_messages",
  "pending_apps",
  "pending_profile",
  "role_access",
];

/**
 * @param {string} name
 */
export function isValidCollectionName(name) {
  if (!name || typeof name !== "string") return false;
  if (name.length > 128) return false;
  return /^[a-z0-9_]+$/i.test(name);
}

/**
 * Legacy pre-storage uploads lived in `docfiles_<id>` collections.
 * UUID file ids include hyphens and are not valid collection names — return null.
 * @param {string | number | null | undefined} id
 * @returns {string | null}
 */
export function legacyDocFilesCollectionName(id) {
  if (id == null || id === "") return null;
  const name = `docfiles_${id}`;
  return isValidCollectionName(name) ? name : null;
}

/**
 * @param {string} name
 */
export function assertValidCollectionName(name) {
  if (!isValidCollectionName(name)) {
    throw new Error(`Invalid collection name: ${name}`);
  }
}
