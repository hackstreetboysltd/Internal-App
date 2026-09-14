'use client';

import { formatPortalCreatedStamp, nextPortalId, portalDateParts } from "@/lib/portalTime";

export const HORIZONS = ["annual", "quarterly", "monthly", "weekly", "daily"];
export const HORIZON_OPTIONS = [
    { value: "all", label: "All time" },
    { value: "annual", label: "Annual" },
    { value: "quarterly", label: "Quarterly" },
    { value: "monthly", label: "Monthly" },
    { value: "weekly", label: "Weekly" },
    { value: "daily", label: "Daily" },
];
export const WORKSPACE_ITEMS_PER_PAGE = 9;
export const ITEMS_PER_PAGE = 5;
export const LEADERBOARD_ITEMS_PER_PAGE = 5;
export const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
];

export function nextItemId() {
    return nextPortalId();
}

let draftSeq = 0;
export function nextDraftKey() {
    draftSeq += 1;
    return `draft-${draftSeq}`;
}

export function sameId(a, b) {
    return String(a) === String(b);
}

export function persistableCollection(list) {
    return (list || []).filter((item) => !item.pendingId && !item.pendingType);
}

export function stripTitles(list) {
    return (list || []).map((record) => {
        if (!record || typeof record !== "object") return record;
        const { title, ...rest } = record;
        return rest;
    });
}

export function getWeekIdentifier(d) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
    return `${date.getUTCFullYear()}-W${weekNo}`;
}

export function computePeriodId(type, now) {
    const p = now
        ? { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() }
        : portalDateParts();
    const pad = (n) => String(n).padStart(2, "0");
    if (type === "annual") return `${p.year}`;
    if (type === "quarterly") {
        const quarter = Math.floor((p.month - 1) / 3) + 1;
        return `${p.year}-Q${quarter}`;
    }
    if (type === "monthly") return `${p.year}-M${pad(p.month)}`;
    if (type === "weekly") return getWeekIdentifier(new Date(p.year, p.month - 1, p.day));
    if (type === "daily") return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
    return "";
}

export function resolveGoalType(record) {
    let type = record && record.type;
    if (!type) {
        type = record && record.weekId ? "weekly" : "annual";
    } else if (type === "short-term") {
        type = "weekly";
    } else if (type === "long-term") {
        type = "annual";
    }
    return type;
}

export function capitalize(type) {
    if (!type) return "";
    return type.charAt(0).toUpperCase() + type.slice(1);
}

export function itemsLabelForType(type) {
    if (type === "annual") return "Yearly Commitments";
    if (type === "quarterly") return "Quarterly Commitments";
    if (type === "monthly") return "Monthly Commitments";
    if (type === "weekly") return "Weekly Commitments";
    return "Daily Commitments";
}

export function formatPeriodLabel(periodId, type) {
    if (!periodId) return "";
    if (type === "monthly") {
        const match = String(periodId).match(/-M(\d{2})/);
        if (match) {
            const monthIdx = parseInt(match[1], 10) - 1;
            if (monthIdx >= 0 && monthIdx < 12) return MONTHS[monthIdx];
        }
    } else if (type === "quarterly") {
        const match = String(periodId).match(/-Q(\d)/);
        if (match) return `Q${match[1]}`;
    } else if (type === "weekly") {
        const match = String(periodId).match(/-W(\d+)/);
        if (match) return `Week ${match[1]}`;
    } else if (type === "daily") {
        const parts = String(periodId).split("-");
        if (parts.length === 3) {
            const monthIdx = parseInt(parts[1], 10) - 1;
            const day = parseInt(parts[2], 10);
            if (monthIdx >= 0 && monthIdx < 12) return `${MONTHS[monthIdx]} ${day}`;
        }
    }
    return periodId;
}

export function getGoalCreatedTime(record) {
    if (record && record.createdAt) {
        const parsed = Date.parse(record.createdAt);
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    const id = Number(record && record.id);
    return Number.isFinite(id) && id > 0 ? id : 0;
}

export function formatGoalCreatedStamp(record) {
    return formatPortalCreatedStamp(getGoalCreatedTime(record));
}

export function escapeHtml(str) {
    return String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

export function escapeRegExp(string) {
    return String(string).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function appMentionRegex() {
    return /@app:([A-Za-z0-9_-]+)/g;
}

function sortedApps(apps) {
    return [...(apps || [])]
        .filter((app) => app && app.name)
        .sort((a, b) => b.name.length - a.name.length);
}

function appById(apps, id) {
    const key = String(id);
    return (apps || []).find((app) => app && String(app.id) === key) || null;
}

function mentionSpan(name, id, forInput) {
    const ce = forInput ? ' contenteditable="false"' : "";
    const data = id != null && id !== "" ? ` data-app-id="${escapeHtml(String(id))}"` : "";
    return `<span style="color: #c084fc; font-weight: 600;"${ce}${data}>@${escapeHtml(name)}</span>`;
}

export function appMentionToken(id) {
    return `@app:${id}`;
}

export function displayGoalText(text, apps) {
    if (!text) return "";
    return String(text).replace(appMentionRegex(), (full, id) => {
        const app = appById(apps, id);
        return app && app.name ? `@${app.name}` : full;
    });
}

export function encodeAppMentions(text, apps) {
    let out = String(text || "");
    sortedApps(apps).forEach((app) => {
        if (app.id == null || app.id === "" || !app.name) return;
        const regex = new RegExp(`@${escapeRegExp(app.name)}(?![:\\w])`, "gi");
        out = out.replace(regex, appMentionToken(app.id));
    });
    return out;
}

function formatGoalTextShared(text, apps, forInput) {
    if (!text) return "";
    let escaped = escapeHtml(text);
    escaped = escaped.replace(appMentionRegex(), (full, id) => {
        const app = appById(apps, id);
        if (!app || !app.name) return full;
        return mentionSpan(app.name, id, forInput);
    });
    sortedApps(apps).forEach((app) => {
        const regex = new RegExp(`(<span[^>]*>[^<]*</span>)|@${escapeRegExp(app.name)}(?![:\\w])`, "gi");
        escaped = escaped.replace(regex, (match, p1) => {
            if (p1) return p1;
            return mentionSpan(app.name, app.id, forInput);
        });
    });
    return escaped;
}

export function formatGoalText(text, apps) {
    return formatGoalTextShared(text, apps, false);
}

export function formatGoalTextForInput(text, apps) {
    return formatGoalTextShared(text, apps, true);
}

export function goalTextMentionsApp(text, app) {
    if (!text || !app) return false;
    const raw = String(text);
    if (app.id != null && app.id !== "") {
        const token = appMentionToken(app.id);
        if (raw.includes(token)) return true;
    }
    const name = (app.name || "").trim();
    if (!name) return false;
    const regex = new RegExp(`@${escapeRegExp(name)}(?![:\\w])`, "i");
    return regex.test(raw);
}

export function serializeGoalEditor(root) {
    if (!root) return "";
    let out = "";
    const walk = (node) => {
        if (!node) return;
        if (node.nodeType === 3) {
            out += node.nodeValue || "";
            return;
        }
        if (node.nodeType !== 1) return;
        const id = typeof node.getAttribute === "function" ? node.getAttribute("data-app-id") : null;
        if (id) {
            out += appMentionToken(id);
            return;
        }
        if (String(node.tagName || "").toUpperCase() === "BR") {
            out += "\n";
            return;
        }
        const children = node.childNodes || [];
        for (let i = 0; i < children.length; i += 1) walk(children[i]);
    };
    walk(root);
    return String(out).replace(/\u00a0/g, " ");
}

export function placeCaretAtEnd(el) {
    if (!el) return;
    el.focus();
    if (typeof window.getSelection === "undefined" || typeof document.createRange === "undefined") return;
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
}

export { allowedEmailsFromRoleAccess } from "@/lib/roleAccess";

export function getDirectoryUsers(users, allowedEmails) {
    const normalizedAllowed = (allowedEmails || []).map((e) => (e || "").trim().toLowerCase());
    return (users || []).filter((u) => u.email && normalizedAllowed.includes(u.email.trim().toLowerCase()));
}

export function directoryEmails(users) {
    return (users || [])
        .map((u) => (u.email || "").trim().toLowerCase())
        .filter(Boolean);
}

export function profileNameForEmail(users, email) {
    const key = (email || "").trim().toLowerCase();
    const match = (users || []).find((u) => (u.email || "").trim().toLowerCase() === key);
    return (match && match.name && match.name.trim()) ? match.name.trim() : key;
}

export function isPersonalGoalRecord(record) {
    return !!(record && record.scope !== "global" && !record.pendingId);
}

export function recordBelongsToEmail(record, email, resolveEmail) {
    const key = (email || "").trim().toLowerCase();
    if (!key || !record) return false;
    if (resolveEmail(record) === key) return true;
    if ((record.email || "").trim().toLowerCase() === key) return true;
    if ((record.user || "").trim().toLowerCase() === key) return true;
    return false;
}

export function cloneRecords(list) {
    return (list || []).map((r) => ({
        ...r,
        goals: Array.isArray(r.goals) ? r.goals.map((g) => ({ ...g })) : [],
    }));
}

/**
 * Portal-approved teammate: not pending/rejected, and on the allowed list when one exists.
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

function emptyHorizonStats() {
    return Object.fromEntries(HORIZONS.map((horizon) => [horizon, { set: 0, achieved: 0 }]));
}

function defaultResolveEmail(record) {
    return ((record && record.email) || "").trim().toLowerCase();
}

/**
 * Flatten a member's personal, non-pending goal items (newest first).
 * @param {unknown[]} records
 * @param {string} email
 * @param {(record: object) => string} [resolveEmail]
 */
export function listMemberGoalItems(records, email, resolveEmail = defaultResolveEmail) {
    const key = (email || "").trim().toLowerCase();
    const items = [];
    for (const record of records || []) {
        if (!isPersonalGoalRecord(record) || !recordBelongsToEmail(record, key, resolveEmail)) continue;
        const type = resolveGoalType(record);
        const goals = Array.isArray(record.goals) ? record.goals : [];
        goals.forEach((goal, index) => {
            if (!goal) return;
            items.push({
                id: `${record.id ?? "row"}-${index}`,
                recordId: record.id,
                index,
                text: goal.text || "",
                done: !!goal.done,
                type,
                createdAt: getGoalCreatedTime(record),
            });
        });
    }
    items.sort((a, b) => {
        if (a.createdAt !== b.createdAt) return b.createdAt - a.createdAt;
        const na = Number(a.recordId);
        const nb = Number(b.recordId);
        if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return nb - na;
        return (a.index || 0) - (b.index || 0);
    });
    return items;
}

/**
 * Personal, non-pending goals for one member: items set vs marked done.
 * @param {unknown[]} records
 * @param {string} email
 * @param {(record: object) => string} [resolveEmail]
 */
export function summarizeMemberGoals(records, email, resolveEmail = defaultResolveEmail) {
    const key = (email || "").trim().toLowerCase();
    const items = listMemberGoalItems(records, key, resolveEmail);
    const byHorizon = emptyHorizonStats();
    let achieved = 0;
    for (const item of items) {
        if (item.done) achieved += 1;
        if (byHorizon[item.type]) {
            byHorizon[item.type].set += 1;
            if (item.done) byHorizon[item.type].achieved += 1;
        }
    }
    return { email: key, set: items.length, achieved, byHorizon, items };
}

/**
 * @param {unknown[]} users
 * @param {string[] | null | undefined} allowedEmails
 * @param {unknown[]} records
 * @param {(record: object) => string} [resolveEmail]
 */
export const MEMBER_GOAL_STATUS_FILTERS = ["all", "completed", "open"];

/**
 * @param {Array<{ done?: boolean }>} items
 * @param {string} status
 */
export function filterMemberGoalItems(items, status) {
    const list = Array.isArray(items) ? items : [];
    if (status === "completed") return list.filter((item) => item && item.done);
    if (status === "open") return list.filter((item) => item && !item.done);
    return list;
}

export function buildMemberGoalDetails(users, allowedEmails, records, resolveEmail = defaultResolveEmail) {
    return listApprovedMembers(users, allowedEmails).map((user) => {
        const email = (user.email || "").trim().toLowerCase();
        const stats = summarizeMemberGoals(records, email, resolveEmail);
        return {
            email,
            name: ((user.name || "").trim() || email),
            set: stats.set,
            achieved: stats.achieved,
            byHorizon: stats.byHorizon,
            items: stats.items,
        };
    });
}
