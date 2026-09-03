/** @type {Record<string, string>} */
const MODULE_PATHS = {
  Skills: "/skills/",
  Procedures: "/procedures/",
  Apps: "/apps/",
  Messages: "/messages/",
  Documents: "/documents/",
  Goals: "/goals/",
  Calendar: "/calendar/",
  "User Access Control": "/profile/",
};

/**
 * @param {string} moduleName
 * @returns {string | null}
 */
export function linkPathForModule(moduleName) {
  return MODULE_PATHS[moduleName] || null;
}

/**
 * @param {string} collectionName
 * @returns {string | null}
 */
export function linkPathForCollection(collectionName) {
  const base = collectionName.startsWith("pending_")
    ? collectionName.slice("pending_".length)
    : collectionName;
  const map = {
    skills: "/skills/",
    procedures: "/procedures/",
    apps: "/apps/",
    messages: "/messages/",
    documents: "/documents/",
    goals: "/goals/",
    calendar: "/calendar/",
    meetings: "/calendar/",
  };
  return map[base] || null;
}
