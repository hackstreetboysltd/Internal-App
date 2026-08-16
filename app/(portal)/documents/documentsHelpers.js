import { getPortalTimeZone } from "@/lib/portalTime";

export const ITEMS_PER_PAGE = 6;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export function sameId(a, b) {
    return String(a) === String(b);
}

export function filesCollectionName(id) {
    return `docfiles_${id}`;
}

export function persistableCollection(list) {
    return (list || []).filter((item) => !item.pendingId && !item.pendingType);
}

export function canManageDocument(doc, actorName) {
    const actor = (actorName || "").toLowerCase();
    if (!actor || !doc) return false;
    return (doc.author || doc.postedBy || "").toLowerCase() === actor;
}

export function sanitizeDocumentName(name) {
    return String(name || "")
        .replace(/[/\\]/g, "")
        .replace(/[\r\n"]/g, "")
        .trim()
        .slice(0, 200);
}

export function applyDocumentRename(list, doc, name) {
    const next = persistableCollection(list);
    const owned = next.find((item) => sameId(item.id, doc.id));
    if (owned) {
        owned.name = name;
        return next;
    }
    const parent = next.find((item) => sameId(item.id, doc.payloadId));
    if (!parent) return next;
    parent.documents = (Array.isArray(parent.documents) ? parent.documents : []).map((item) => (
        sameId(item.id, doc.id) ? { ...item, name } : item
    ));
    return next;
}

export function fileExtension(name) {
    const parts = String(name || "").split(".");
    if (parts.length < 2) return "";
    return parts.pop().toLowerCase();
}

export function docIconForName(name) {
    const ext = fileExtension(name);
    if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "fa-regular fa-image";
    if (["xls", "xlsx", "csv"].includes(ext)) return "fa-solid fa-file-excel";
    if (["ppt", "pptx"].includes(ext)) return "fa-solid fa-file-powerpoint";
    if (ext === "pdf") return "fa-solid fa-file-pdf";
    if (["doc", "docx"].includes(ext)) return "fa-solid fa-file-word";
    if (["zip", "rar", "7z"].includes(ext)) return "fa-solid fa-file-zipper";
    if (["mp4", "mov", "webm"].includes(ext)) return "fa-solid fa-file-video";
    if (["mp3", "wav", "m4a"].includes(ext)) return "fa-solid fa-file-audio";
    if (["txt", "md", "rtf"].includes(ext)) return "fa-solid fa-file-lines";
    return "fa-solid fa-file";
}

export function formatFileBytes(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDocMeta(doc) {
    const who = doc.author || doc.postedBy || "Team";
    const at = doc.postedAt;
    if (!at) return who;
    const d = new Date(at);
    if (Number.isNaN(d.getTime())) return who;
    return `${who} · ${d.toLocaleDateString(undefined, { timeZone: getPortalTimeZone(), month: "short", day: "numeric" })}`;
}

export function downloadDataUrl(dataUrl, filename) {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename || "document";
    document.body.appendChild(a);
    a.click();
    a.remove();
}

export function flattenDocuments(list) {
    const rows = [];
    for (const item of list || []) {
        const nested = Array.isArray(item.documents) ? item.documents : [];
        if (nested.length) {
            for (const doc of nested) {
                rows.push({
                    id: doc.id,
                    name: doc.name,
                    author: doc.postedBy || item.author,
                    postedAt: doc.postedAt,
                    hasFile: doc.hasFile,
                    payloadId: item.id,
                });
            }
        } else {
            rows.push({
                id: item.id,
                name: item.name,
                author: item.author || item.postedBy,
                postedAt: item.postedAt,
                hasFile: item.hasFile !== false,
                payloadId: item.id,
            });
        }
    }
    rows.sort((a, b) => {
        const tb = Date.parse(b.postedAt) || 0;
        const ta = Date.parse(a.postedAt) || 0;
        if (tb !== ta) return tb - ta;
        return String(b.id).localeCompare(String(a.id));
    });
    return rows;
}

export function matchesDocumentSearch(doc, query) {
    if (!query) return true;
    return [doc.name, doc.author, fileExtension(doc.name)]
        .some((v) => (v || "").toLowerCase().includes(query));
}
