'use client';

import { apiFetchPath } from "@/lib/apiPath";
import { fetchCollection, putCollection, watchCollection, invalidateCollectionCache } from "./dataApi";
import {
  emailForStoredOwnerName,
  normalizeEmail,
  normalizePersonName,
  profileForEmail,
} from "./normalize";
import { getSessionActor, isAdminView, loadSessionUser } from "./session";

export class PortalApiError extends Error {
    constructor(message, status, extra = {}) {
        super(message);
        this.name = "PortalApiError";
        this.status = status;
        Object.assign(this, extra);
    }
}

const collections = [
    "skills", "procedures", "goals", "calendar", "meetings", "messages", "apps",
    "documents",
    "profile", "auth", "settings", "pending_skills", "pending_procedures",
    "pending_goals", "pending_calendar", "pending_meetings", "pending_messages",
    "pending_apps", "pending_profile", "role_access",
];

function readIsAdmin(options) {
    if (options && typeof options.admin === "boolean") return options.admin;
    return isAdminView();
}

async function getCollection(collectionName, options = {}) {
    return fetchCollection(collectionName, options);
}

async function saveCollection(collectionName, data, options = {}) {
    return putCollection(collectionName, data, options);
}

function safeEquals(a, b) {
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
            for (let i = 0; i < a.length; i++) {
                if (!safeEquals(a[i], b[i])) return false;
            }
            return true;
        }
        if (Array.isArray(a) || Array.isArray(b)) return false;

        const keysA = Object.keys(a);
        const keysB = Object.keys(b);
        if (keysA.length !== keysB.length) return false;
        for (const k of keysA) {
            if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
            if (!safeEquals(a[k], b[k])) return false;
        }
        return true;
    }
    return false;
}

function isDocumentsOnlyChange(oldItem, newItem) {
    const keys = new Set([...Object.keys(oldItem || {}), ...Object.keys(newItem || {})]);
    for (const key of keys) {
        if (key === "documents") continue;
        if (!safeEquals(oldItem[key], newItem[key])) return false;
    }
    return true;
}

function isDocumentsChangeAuthorized(oldItem, newItem, actorName) {
    const actor = (actorName || "").toLowerCase();
    const recordOwner = (oldItem.author || "").toLowerCase();
    const isRecordOwner = !!(actor && recordOwner && actor === recordOwner);
    const oldDocs = Array.isArray(oldItem.documents) ? oldItem.documents : [];
    const newDocs = Array.isArray(newItem.documents) ? newItem.documents : [];

    for (const od of oldDocs) {
        const nd = newDocs.find((d) => String(d.id) === String(od.id));
        const postedBy = (od.postedBy || "").toLowerCase();
        const ownsDoc = !!(actor && postedBy && actor === postedBy);
        if (!nd) {
            if (!ownsDoc && !isRecordOwner) return false;
            continue;
        }
        if (!safeEquals(od, nd) && !ownsDoc) return false;
    }
    for (const nd of newDocs) {
        const existed = oldDocs.some((d) => String(d.id) === String(nd.id));
        if (existed) continue;
        if ((nd.postedBy || "").toLowerCase() !== actor) return false;
    }
    return true;
}

function resolveGoalRecordEmail(record, users) {
    if (!record) return "";
    const fromStoredName = emailForStoredOwnerName(record.user || record.author, users);
    if (fromStoredName) return fromStoredName;
    return normalizeEmail(record.email);
}

function actorOwnsGoalRecord(record, actor, users) {
    const actorEmail = normalizeEmail(actor && actor.email);
    const recordEmail = resolveGoalRecordEmail(record, users);
    if (actorEmail && recordEmail && actorEmail === recordEmail) return true;
    const ownerKey = normalizePersonName(record && (record.user || record.author));
    const actorName = normalizePersonName(actor && actor.name);
    return !!(ownerKey && actorName && ownerKey === actorName);
}

function actorCanManageGoalRecord(record, actor, users) {
    if (actorOwnsGoalRecord(record, actor, users)) return true;
    const actorEmail = normalizeEmail(actor && actor.email);
    const createdByEmail = normalizeEmail(record && record.createdByEmail);
    if (actorEmail && createdByEmail && actorEmail === createdByEmail) return true;
    const createdBy = normalizePersonName(record && record.createdBy);
    const actorName = normalizePersonName(actor && actor.name);
    return !!(createdBy && actorName && createdBy === actorName);
}

function redactMessageWrapsForActor(messages) {
    const actor = getSessionActor();
    const email = normalizeEmail(actor && actor.email);
    if (!Array.isArray(messages)) return messages;
    return messages.map((m) => {
        if (!m || !Array.isArray(m.wrappedKeys)) return m;
        const hasEcdh = m.wrappedKeys.some((w) => w && w.type === "ecdh");
        if (!hasEcdh) return m;
        return {
            ...m,
            wrappedKeys: m.wrappedKeys.filter((w) => w && w.type === "ecdh" && normalizeEmail(w.email) === email),
        };
    });
}

function restoreRedactedMessageWraps(oldCollection, incoming) {
    if (!Array.isArray(incoming)) return incoming;
    const oldMap = new Map((oldCollection || []).map((i) => [String(i.id), i]));
    return incoming.map((item) => {
        if (!item) return item;
        const prev = oldMap.get(String(item.id));
        if (!prev || !Array.isArray(prev.wrappedKeys)) return item;
        const nextWraps = Array.isArray(item.wrappedKeys) ? item.wrappedKeys : [];
        const nextEcdh = nextWraps.filter((w) => w && w.type === "ecdh");
        const prevEcdh = prev.wrappedKeys.filter((w) => w && w.type === "ecdh");
        if (!prevEcdh.length) return item;
        const to = Array.isArray(item.to) ? item.to.map(normalizeEmail).filter(Boolean) : [];
        const complete = to.length > 0 && to.every((email) => nextEcdh.some((w) => normalizeEmail(w.email) === email));
        if (complete) return item;
        const nextEmails = new Set(nextEcdh.map((w) => normalizeEmail(w.email)));
        const preserved = prevEcdh.filter((w) => !nextEmails.has(normalizeEmail(w.email)));
        if (!preserved.length) return item;
        return { ...item, wrappedKeys: [...nextWraps, ...preserved] };
    });
}

export const GoalUser = {
    normalizeEmail,
    resolveEmail: resolveGoalRecordEmail,
    actorOwnsRecord: actorOwnsGoalRecord,
    actorCanManageRecord: actorCanManageGoalRecord,
};

function goalRecordActorCanModify(oldItem, actor) {
    return actorCanManageGoalRecord(oldItem, actor, []);
}

let githubPat = null;

export function setGithubPat(token) {
    githubPat = token || null;
    if (typeof window === "undefined") return;
    if (token) sessionStorage.setItem("github_pat", token);
    else sessionStorage.removeItem("github_pat");
}

export function getGithubPat() {
    if (githubPat) return githubPat;
    if (typeof window === "undefined") return null;
    githubPat = sessionStorage.getItem("github_pat");
    return githubPat;
}

function throwDenied() {
    throw new PortalApiError(
        "Permission Denied: Unauthorized modification or deletion of records owned by another user.",
        403,
    );
}

/** Collections whose admin list merges a pending_* approval queue. */
const ADMIN_PENDING_MERGE = new Set([
    "skills",
    "procedures",
    "goals",
    "calendar",
    "meetings",
    "messages",
    "apps",
]);

/**
 * Admin reads must bypass the sync/localStorage cache.
 * Admin puts clear that cache; delta-sync against a cleared/stale cursor returns empty
 * upserts and can also notify cache subscribers → re-get loops that leave modules on skeletons.
 */
function adminFetchOptions(options = {}) {
    return {
        ...options,
        admin: true,
        bypassCache: true,
        cacheFirst: false,
        cached: false,
    };
}

export async function get(collectionName, options = {}) {
    const isAdmin = readIsAdmin(options);

    if (isAdmin && ADMIN_PENDING_MERGE.has(collectionName)) {
        const fetchOpts = adminFetchOptions(options);
        const [pendingRaw, activeRaw] = await Promise.all([
            getCollection("pending_" + collectionName, fetchOpts),
            getCollection(collectionName, fetchOpts),
        ]);
        const pending = Array.isArray(pendingRaw) ? pendingRaw : [];
        const active = Array.isArray(activeRaw) ? activeRaw : [];
        const formatted = pending.map((item) => ({
            ...item.data,
            pendingId: item.id,
            pendingType: item.type,
            pendingAuthor: item.author,
        }));
        const pendingIds = new Set(pending.filter((p) => p.type !== "create").map((p) => String(p.id)));
        const filteredActive = active.filter((a) => !pendingIds.has(String(a.id)));
        const combined = [...formatted, ...filteredActive];
        return collectionName === "messages" ? redactMessageWrapsForActor(combined) : combined;
    }

    if (isAdmin) {
        const data = await getCollection(collectionName, adminFetchOptions(options));
        return collectionName === "messages" ? redactMessageWrapsForActor(data) : data;
    }

    const data = await getCollection(collectionName, {
        cacheFirst: options.cacheFirst !== false,
        cached: options.cached === true,
        bypassCache: options.bypassCache === true,
        admin: false,
    });
    return collectionName === "messages" ? redactMessageWrapsForActor(data) : data;
}

/**
 * Subscribe to a collection: emit cached rows immediately, then server deltas.
 * Use for module screens. Mutations should keep calling `get()` (waits for network).
 *
 * Admin view is a one-shot `get()` (bypassCache + pending merge). Do not subscribe
 * admin watches to the sync cache — writes/notifies re-enter get() and starve onData.
 *
 * @param {string} collectionName
 * @param {(items: unknown[]) => void} onData
 * @param {{ admin?: boolean, onError?: (err: unknown) => void }} [options]
 */
export function watch(collectionName, onData, options = {}) {
    const isAdmin = readIsAdmin(options);
    if (isAdmin) {
        let stopped = false;
        let settled = false;
        const finish = (fn) => {
            if (stopped || settled) return;
            settled = true;
            fn();
        };
        const timeoutId = setTimeout(() => {
            finish(() => {
                console.warn(`Admin watch(${collectionName}) timed out`);
                options.onError?.(new Error(`watch(${collectionName}) timed out`));
            });
        }, 15_000);
        get(collectionName, options)
            .then((items) => {
                finish(() => onData(Array.isArray(items) ? items : []));
            })
            .catch((err) => {
                finish(() => options.onError?.(err));
            })
            .finally(() => clearTimeout(timeoutId));
        return () => {
            stopped = true;
            clearTimeout(timeoutId);
        };
    }

    return watchCollection(collectionName, (items) => {
        const list = collectionName === "messages" ? redactMessageWrapsForActor(items) : items;
        onData(Array.isArray(list) ? list : []);
    }, options);
}

async function postPendingAction(collectionName, id, action) {
    const res = await fetch(
        apiFetchPath(
            `/api/data/${encodeURIComponent(collectionName)}/pending/${encodeURIComponent(String(id))}/${action}`,
            { admin: isAdminView() },
        ),
        {
            method: "POST",
            credentials: "include",
            cache: "no-store",
        },
    );
    if (!res.ok) {
        let detail = res.statusText;
        try {
            const body = await res.json();
            detail = body.error || detail;
        } catch {
            /* ignore */
        }
        throw new PortalApiError(detail, res.status);
    }
    invalidateCollectionCache(collectionName);
    invalidateCollectionCache(`pending_${collectionName}`);
    return res.json();
}

export async function approve(collectionName, id) {
    return postPendingAction(collectionName, id, "approve");
}

export async function reject(collectionName, id) {
    return postPendingAction(collectionName, id, "reject");
}

export async function save(collectionName, body, options = {}) {
    const isAdmin = readIsAdmin(options);
    if (!Array.isArray(body)) {
        throw new PortalApiError("Save payload must be an array", 400);
    }

    const snapshotOpts = { cached: true, admin: isAdmin };
    const oldCollection = await getCollection(collectionName, snapshotOpts);

    if (["skills", "procedures", "goals", "calendar", "meetings", "messages", "apps", "documents"].includes(collectionName)) {
        const actor = getSessionActor();
        const skipOwnerGuard = isAdmin
            && (collectionName === "goals" || collectionName === "apps")
            && (loadSessionUser()?.roles || []).includes("admin");

        const isUnauthorized = !skipOwnerGuard && oldCollection.some((oldItem) => {
            if (collectionName === "goals") {
                if (goalRecordActorCanModify(oldItem, actor)) return false;
                const owner = oldItem.user || oldItem.author;
                if (!owner && !oldItem.createdBy) return false;
            }

            const author = oldItem.author || oldItem.user;
            if (!author) return false;

            const isNotOwner = author.toLowerCase() !== actor.name.toLowerCase();
            if (isNotOwner) {
                const newItem = body.find((n) => String(n.id) === String(oldItem.id));
                if (!newItem) {
                    console.warn(`Access Denied: Attempted unauthorized deletion of item ${oldItem.id} by ${actor.name}`);
                    return true;
                }
                const keys = new Set([...Object.keys(oldItem), ...Object.keys(newItem)]);
                for (const key of keys) {
                    if (key === "documents") {
                        if (!isDocumentsChangeAuthorized(oldItem, newItem, actor.name)) return true;
                    } else if (key === "tickets") {
                        const oldTickets = oldItem.tickets || [];
                        const newTickets = newItem.tickets || [];

                        const ticketDeleted = oldTickets.some((ot) => !newTickets.some((nt) => String(nt.id) === String(ot.id)));
                        if (ticketDeleted) return true;

                        const unauthorizedTicketEdit = oldTickets.some((ot) => {
                            const ticketAuthor = ot.author;
                            if (!ticketAuthor) return false;
                            if (ticketAuthor.toLowerCase() !== actor.name.toLowerCase()) {
                                const nt = newTickets.find((x) => String(x.id) === String(ot.id));
                                if (!nt || !safeEquals(nt, ot)) {
                                    return true;
                                }
                            }
                            return false;
                        });
                        if (unauthorizedTicketEdit) return true;
                    } else {
                        const oldVal = oldItem[key];
                        const newVal = newItem[key];
                        if (!safeEquals(oldVal, newVal)) {
                            return true;
                        }
                    }
                }
            }
            return false;
        });

        if (isUnauthorized) throwDenied();
    }

    const oldMap = new Map(oldCollection.map((item) => [String(item.id), item]));
    const newMap = new Map(body.map((item) => [String(item.id), item]));

    if (collectionName === "goals") {
        const actor = getSessionActor();
        const pending = await getCollection("pending_goals", snapshotOpts);

        const createdGlobals = [];
        const editedGlobals = [];
        const listToSave = [];
        let globalChangesDetected = false;

        for (const newItem of body) {
            const oldItem = oldMap.get(String(newItem.id));
            if (!oldItem) {
                if (newItem.scope === "global") {
                    createdGlobals.push(newItem);
                    globalChangesDetected = true;
                } else {
                    listToSave.push(newItem);
                }
            } else if (!safeEquals(oldItem, newItem)) {
                if (newItem.scope === "global") {
                    editedGlobals.push(newItem);
                    globalChangesDetected = true;
                    listToSave.push(oldItem);
                } else {
                    listToSave.push(newItem);
                }
            } else {
                listToSave.push(newItem);
            }
        }

        if (globalChangesDetected) {
            for (const item of createdGlobals) {
                pending.push({
                    id: item.id || Date.now(),
                    type: "create",
                    author: item.user || actor.name,
                    data: item,
                });
            }
            for (const item of editedGlobals) {
                const idx = pending.findIndex((p) => String(p.id) === String(item.id) && p.type === "edit");
                if (idx !== -1) {
                    pending[idx].data = item;
                } else {
                    pending.push({
                        id: item.id,
                        type: "edit",
                        author: item.user || actor.name,
                        data: item,
                    });
                }
            }
            await saveCollection("pending_goals", pending, { admin: isAdmin });
            alert("Your global goal has been submitted to the Admin for approval.");
        }

        await saveCollection(collectionName, listToSave, { admin: isAdmin });
        return { success: true, pending: globalChangesDetected };
    }

    const created = [];
    const edited = [];
    for (const newItem of body) {
        const oldItem = oldMap.get(String(newItem.id));
        if (!oldItem) {
            created.push(newItem);
        } else if (!safeEquals(oldItem, newItem)) {
            edited.push(newItem);
        }
    }

    const requiresApproval = ["skills", "procedures", "calendar", "meetings", "apps"];

    const documentOnlyEdits = (collectionName === "calendar" || collectionName === "meetings")
        && created.length === 0
        && edited.length > 0
        && edited.every((item) => isDocumentsOnlyChange(oldMap.get(String(item.id)), item));

    if (documentOnlyEdits) {
        await saveCollection(collectionName, body, { admin: isAdmin });
        return { success: true };
    }

    // Admin Mode writes go live immediately; only non-admin users queue for approval.
    if (
        !isAdmin
        && requiresApproval.includes(collectionName)
        && (created.length > 0 || edited.length > 0)
    ) {
        const pendingCol = "pending_" + collectionName;
        const pending = await getCollection(pendingCol, snapshotOpts);
        const actor = getSessionActor();

        for (const item of created) {
            pending.push({
                id: item.id || Date.now(),
                type: "create",
                author: item.author || item.user || actor.name,
                data: item,
            });
        }

        for (const item of edited) {
            const idx = pending.findIndex((p) => String(p.id) === String(item.id) && p.type === "edit");
            if (idx !== -1) {
                pending[idx].data = item;
            } else {
                pending.push({
                    id: item.id,
                    type: "edit",
                    author: item.author || item.user || actor.name,
                    data: item,
                });
            }
        }

        await saveCollection(pendingCol, pending, { admin: isAdmin });
        alert("Your changes have been submitted to the Admin for approval.");

        const listToSave = [];
        for (const oldItem of oldCollection) {
            if (newMap.has(String(oldItem.id))) {
                listToSave.push(oldItem);
            }
        }
        await saveCollection(collectionName, listToSave, { admin: isAdmin });
        return { success: true, pending: true };
    }

    // Admin direct writes supersede any queued create/edit for the same records.
    if (isAdmin && requiresApproval.includes(collectionName)) {
        const touchedIds = new Set([
            ...created.map((item) => String(item.id)),
            ...edited.map((item) => String(item.id)),
        ]);
        for (const oldItem of oldCollection) {
            if (!newMap.has(String(oldItem.id))) {
                touchedIds.add(String(oldItem.id));
            }
        }
        if (touchedIds.size > 0) {
            const pendingCol = "pending_" + collectionName;
            const pending = await getCollection(pendingCol, snapshotOpts);
            const remaining = pending.filter(
                (p) => !touchedIds.has(String(p.id)) || (p.type !== "create" && p.type !== "edit"),
            );
            if (remaining.length !== pending.length) {
                await saveCollection(pendingCol, remaining, { admin: true });
            }
        }
    }

    if (collectionName === "profile") {
        let existing = Array.isArray(oldCollection) ? oldCollection.slice() : [];
        if (!Array.isArray(existing)) {
            existing = [];
        }

        body.forEach((incoming) => {
            if (!incoming || !incoming.email) return;
            const idx = existing.findIndex((e) => e.email && e.email.toLowerCase() === incoming.email.toLowerCase());
            if (idx === -1) {
                existing.push(incoming);
            } else {
                existing[idx] = { ...existing[idx], ...incoming };
            }
        });

        await saveCollection(collectionName, existing, { admin: isAdmin });
        return { success: true };
    }

    const toSave = collectionName === "messages" ? restoreRedactedMessageWraps(oldCollection, body) : body;
    await saveCollection(collectionName, toSave, { admin: isAdmin });
    return { success: true };
}

export async function githubStatus() {
    const hasPat = !!getGithubPat();
    return {
        configured: hasPat,
        connected: hasPat,
        clientId: "static-pat-mode",
        expiry: null,
    };
}

export async function githubCommits(repo) {
    const token = getGithubPat();
    if (!token) {
        throw new PortalApiError("GitHub session expired. Please reconnect.", 401, { expired: true });
    }

    try {
        const ghRes = await fetch(`https://api.github.com/repos/${repo}/commits?per_page=15`, {
            headers: {
                Accept: "application/vnd.github+json",
                Authorization: `Bearer ${token}`,
            },
        });

        if (!ghRes.ok) {
            if (ghRes.status === 401 || ghRes.status === 403) {
                setGithubPat(null);
                throw new PortalApiError("GitHub access denied. Please reconnect.", 401, { expired: true });
            }
            throw new PortalApiError("GitHub API error.", ghRes.status);
        }

        const commits = await ghRes.json();
        return commits.map((c) => ({
            sha: c.sha.substring(0, 7),
            message: c.commit.message.split("\n")[0],
            author: c.commit.author?.name || "Unknown",
            date: c.commit.author?.date,
            url: c.html_url,
        }));
    } catch (err) {
        if (err instanceof PortalApiError) throw err;
        throw new PortalApiError("Failed to fetch commits.", 500);
    }
}

export { getCollection, saveCollection, collections, profileForEmail };
