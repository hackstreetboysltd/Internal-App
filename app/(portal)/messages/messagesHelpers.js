export const ITEMS_PER_PAGE = 5;

export function nextItemId() {
    return Date.now();
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
    const ms = getMessageCreatedTime(m);
    if (!ms) return { time: "", date: "" };
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return { time: "", date: "" };

    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    if (hours === 0) hours = 12;
    const time = `${String(hours).padStart(2, "0")}:${minutes} ${ampm}`;

    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return { time, date: `${day}/${month}/${year}` };
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
