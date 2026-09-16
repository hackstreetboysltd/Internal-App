/**
 * Helpers for role_access collection records.
 */

/**
 * Portal-active teammate: not pending/rejected, and on the allowed list when one exists.
 * @param {{ email?: string, approvedStatus?: string } | null | undefined} user
 * @param {string[] | null | undefined} allowedEmails
 */
export function isApprovedMember(user, allowedEmails) {
    const email = (user && user.email ? String(user.email) : "").trim().toLowerCase();
    if (!email) return false;
    const status = String((user && user.approvedStatus) || "").toLowerCase();
    if (status === "rejected" || status === "pending") return false;
    const allowed = (allowedEmails || [])
        .map((e) => (e || "").trim().toLowerCase())
        .filter(Boolean);
    if (allowed.length > 0) return allowed.includes(email);
    return status === "approved";
}

/**
 * @param {Array<{ email?: string, name?: string, approvedStatus?: string }>} users
 * @param {string[] | null | undefined} allowedEmails
 */
export function listApprovedMembers(users, allowedEmails) {
    return (users || [])
        .filter((user) => isApprovedMember(user, allowedEmails))
        .sort((a, b) => {
            const an = ((a.name || "").trim() || a.email || "");
            const bn = ((b.name || "").trim() || b.email || "");
            return an.localeCompare(bn, undefined, { sensitivity: "base" });
        });
}

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
