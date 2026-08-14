export function nextItemId() {
    return Date.now();
}

export const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
];

export const MAX_INLINE_FILE_BYTES = 512 * 1024;

export function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function toDateStr(value) {
    if (!value) return "";
    return String(value).slice(0, 10);
}

export function itemDateStr(item) {
    return item.kind === "meeting" ? toDateStr(item.time) : toDateStr(item.date);
}

export function persistableCollection(list) {
    return (list || []).filter((item) => !item.pendingId && !item.pendingType);
}

export function itemDocuments(item) {
    return Array.isArray(item && item.documents) ? item.documents : [];
}

export function recordTitle(item) {
    if (!item) return "Record";
    return item.kind === "meeting" ? (item.agenda || "Meeting") : (item.title || "Event");
}

export function filesCollectionName(kind, id) {
    return `calfiles_${kind}_${id}`;
}

export function canManageDocument(item, doc, actorName) {
    const actor = (actorName || "").toLowerCase();
    if (!actor) return false;
    if ((doc.postedBy || "").toLowerCase() === actor) return true;
    return (item.author || "").toLowerCase() === actor;
}

export function matchesSearch(item, query) {
    if (!query) return true;
    if (item.kind === "event") {
        const docNames = (item.documents || []).map((d) => d.name).join(" ");
        return [item.title, item.author, item.date, item.loc, docNames]
            .some((v) => (v || "").toLowerCase().includes(query));
    }
    const timeLabel = item.time ? new Date(item.time).toLocaleString() : "";
    let status = "";
    if (item.time) {
        const diffMs = new Date(item.time) - new Date();
        if (diffMs > 0) status = "upcoming";
        else if (Math.abs(diffMs) < 60 * 60 * 1000) status = "in progress";
        else status = "completed";
    }
    return [item.agenda, item.minutes, item.author, item.link, timeLabel, status, "meeting", (item.documents || []).map((d) => d.name).join(" ")]
        .some((v) => (v || "").toLowerCase().includes(query));
}

export function formatDayTitle(dateStr) {
    return new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, {
        weekday: "long", month: "long", day: "numeric", year: "numeric",
    });
}

export function itemClockTime(item) {
    if (item.kind === "meeting" && item.time) {
        const d = new Date(item.time);
        if (!Number.isNaN(d.getTime())) {
            return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
        }
    }
    return "All day";
}

export function itemHourFraction(item) {
    if (item.kind !== "meeting" || !item.time) return null;
    const d = new Date(item.time);
    if (Number.isNaN(d.getTime())) return null;
    return (d.getHours() + d.getMinutes() / 60) / 24;
}

export function safeDocHref(url) {
    try {
        const parsed = new URL(url, typeof window !== "undefined" ? window.location.origin : "https://example.com");
        if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.href;
    } catch (e) { /* ignore */ }
    return "";
}

export function docIconForName(name) {
    const ext = (name || "").split(".").pop().toLowerCase();
    if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "fa-regular fa-image";
    if (["xls", "xlsx", "csv"].includes(ext)) return "fa-solid fa-file-excel";
    if (["ppt", "pptx"].includes(ext)) return "fa-solid fa-file-powerpoint";
    if (ext === "pdf") return "fa-solid fa-file-pdf";
    if (["doc", "docx"].includes(ext)) return "fa-solid fa-file-word";
    if (["zip", "rar", "7z"].includes(ext)) return "fa-solid fa-file-zipper";
    return "fa-solid fa-file-lines";
}

export function formatDocMeta(doc) {
    const who = doc.postedBy || "Team";
    if (!doc.postedAt) return who;
    const d = new Date(doc.postedAt);
    if (Number.isNaN(d.getTime())) return who;
    return `${who} · ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

export function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error("Could not read file"));
        reader.readAsDataURL(file);
    });
}

export function downloadDataUrl(dataUrl, filename) {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename || "document";
    document.body.appendChild(a);
    a.click();
    a.remove();
}

export function meetingStatus(time) {
    const mDate = new Date(time);
    const diffMs = mDate - new Date();
    let statusBadge = "Completed";
    let badgeClass = "success";
    if (diffMs > 0) {
        statusBadge = "Upcoming";
        badgeClass = "pending";
    } else if (Math.abs(diffMs) < 60 * 60 * 1000) {
        statusBadge = "In Progress";
        badgeClass = "danger";
    }
    return { statusBadge, badgeClass, mDate };
}
