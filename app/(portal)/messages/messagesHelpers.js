import { formatPortalCreatedStamp, nextPortalId } from "@/lib/portalTime";

export const ITEMS_PER_PAGE = 5;

export function nextItemId() {
    return nextPortalId();
}

export function persistableCollection(list) {
    return (list || []).filter((item) => !item.pendingId && !item.pendingType);
}

export function sameId(a, b) {
    return String(a) === String(b);
}

export function cloneMessages(list) {
    return (list || []).map((m) => ({
        ...m,
        wrappedKeys: Array.isArray(m.wrappedKeys) ? m.wrappedKeys.map((w) => ({ ...w })) : m.wrappedKeys,
        to: Array.isArray(m.to) ? [...m.to] : m.to,
    }));
}

export function getMessageCreatedTime(m) {
    if (m && m.createdAt) {
        const parsed = new Date(m.createdAt).getTime();
        if (!Number.isNaN(parsed)) return parsed;
    }
    const id = Number(m && m.id);
    return Number.isNaN(id) ? 0 : id;
}

export function formatMessageCreatedStamp(m) {
    return formatPortalCreatedStamp(getMessageCreatedTime(m));
}

export function messageEmail(m, users) {
    const stored = (m && m.email ? m.email : "").trim().toLowerCase();
    if (stored) return stored;

    const author = (m && m.author ? m.author : "").trim().toLowerCase();
    if (!author) return "";
    if (author.includes("@")) return author;

    const hit = (users || []).find((u) => {
        const name = (u.name || "").trim().toLowerCase();
        const email = (u.email || "").trim().toLowerCase();
        return (name && name === author) || (email && email === author);
    });
    return hit ? (hit.email || "").trim().toLowerCase() : "";
}
