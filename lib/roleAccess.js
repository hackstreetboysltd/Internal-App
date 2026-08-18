/**
 * Helpers for role_access collection records.
 */

/**
 * @param {unknown} roleAccess
 * @returns {string[]}
 */
export function allowedEmailsFromRoleAccess(roleAccess) {
    const list = Array.isArray(roleAccess) ? roleAccess : [];
    const allowedRec = list.find((r) => r && r.id === "allowed");
    return (allowedRec && allowedRec.emails ? allowedRec.emails : [])
        .map((e) => (e || "").trim().toLowerCase())
        .filter(Boolean);
}

/**
 * @param {unknown} roleAccess
 * @returns {string[]}
 */
export function adminEmailsFromRoleAccess(roleAccess) {
    const list = Array.isArray(roleAccess) ? roleAccess : [];
    const adminsRec = list.find((r) => r && r.id === "admins");
    return (adminsRec && adminsRec.emails ? adminsRec.emails : [])
        .map((e) => (e || "").trim().toLowerCase())
        .filter(Boolean);
}
