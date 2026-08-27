import { getPortalTimeZone } from "@/lib/portalTime";
import { BASE_PATH, apiPath } from "@/lib/apiPath";
import { getCollection } from "@/lib/portalApi";

export const ITEMS_PER_PAGE = 6;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
/** Keep each request under Vercel’s ~4.5 MB body limit. */
export const UPLOAD_CHUNK_BYTES = 3 * 1024 * 1024;

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

export function isDocumentGroup(item) {
    if (!item || typeof item !== "object") return false;
    if (item.kind === "group" || item.type === "group") return true;
    const nested = Array.isArray(item.documents) ? item.documents : [];
    return nested.length > 0 && item.hasFile !== true;
}

export function applyDocumentRename(list, doc, name) {
    const next = persistableCollection(list);
    const owned = next.find((item) => sameId(item.id, doc.id) && !isDocumentGroup(item));
    if (owned) {
        owned.name = name;
    }
    for (const item of next) {
        if (!isDocumentGroup(item)) continue;
        item.documents = (Array.isArray(item.documents) ? item.documents : []).map((entry) => (
            sameId(entry.id, doc.id) ? { ...entry, name } : entry
        ));
    }
    if (owned) return next;
    const parent = next.find((item) => sameId(item.id, doc.payloadId));
    if (!parent || isDocumentGroup(parent)) return next;
    parent.documents = (Array.isArray(parent.documents) ? parent.documents : []).map((item) => (
        sameId(item.id, doc.id) ? { ...item, name } : item
    ));
    return next;
}

/** Strip a document id from every group after the file itself is deleted. */
export function removeDocumentFromGroups(list, docId) {
    return (list || []).map((item) => {
        if (!isDocumentGroup(item)) return item;
        const documents = (Array.isArray(item.documents) ? item.documents : [])
            .filter((entry) => !sameId(entry.id, docId));
        return { ...item, documents };
    });
}

export function groupedDocumentIds(list) {
    const ids = new Set();
    for (const item of list || []) {
        if (!isDocumentGroup(item)) continue;
        for (const doc of item.documents || []) {
            if (doc?.id != null) ids.add(String(doc.id));
        }
    }
    return ids;
}

/**
 * Library grid rows: ungrouped files + group folders (grouped files stay hidden).
 * @returns {Array<{ kind: 'doc' | 'group', id: string, name?: string, author?: string, postedAt?: string, documents?: object[], count?: number, hasFile?: boolean, mimeType?: string|null, size?: number, payloadId?: string }>}
 */
export function listLibraryItems(list) {
    const grouped = groupedDocumentIds(list);
    const rows = [];
    for (const item of list || []) {
        if (isDocumentGroup(item)) {
            const documents = Array.isArray(item.documents) ? item.documents : [];
            rows.push({
                kind: "group",
                id: item.id,
                name: item.name,
                author: item.author || item.postedBy,
                postedAt: item.postedAt,
                documents,
                count: documents.length,
            });
            continue;
        }
        if (grouped.has(String(item.id))) continue;
        const nested = Array.isArray(item.documents) ? item.documents : [];
        if (nested.length) {
            for (const doc of nested) {
                if (grouped.has(String(doc.id))) continue;
                rows.push({
                    kind: "doc",
                    id: doc.id,
                    name: doc.name,
                    author: doc.postedBy || item.author,
                    postedAt: doc.postedAt,
                    hasFile: doc.hasFile,
                    mimeType: doc.mimeType || null,
                    size: doc.size,
                    payloadId: item.id,
                });
            }
            continue;
        }
        rows.push({
            kind: "doc",
            id: item.id,
            name: item.name,
            author: item.author || item.postedBy,
            postedAt: item.postedAt,
            hasFile: item.hasFile !== false,
            mimeType: item.mimeType || null,
            size: item.size,
            payloadId: item.id,
        });
    }
    rows.sort((a, b) => {
        const tb = Date.parse(b.postedAt) || 0;
        const ta = Date.parse(a.postedAt) || 0;
        if (tb !== ta) return tb - ta;
        return String(b.id).localeCompare(String(a.id));
    });
    return rows;
}

export function matchesLibrarySearch(item, query) {
    if (!query) return true;
    if (item?.kind === "group") {
        if ([item.name, item.author].some((v) => (v || "").toLowerCase().includes(query))) return true;
        return (item.documents || []).some((doc) => matchesDocumentSearch(doc, query));
    }
    return matchesDocumentSearch(item, query);
}

/** Resolve live file metadata for a group's snapshots. */
export function resolveGroupDocuments(group, list) {
    const byId = new Map();
    for (const item of list || []) {
        if (isDocumentGroup(item)) continue;
        byId.set(String(item.id), item);
    }
    return (Array.isArray(group?.documents) ? group.documents : []).map((snap) => {
        const live = byId.get(String(snap.id));
        if (live) {
            return {
                id: live.id,
                name: live.name,
                author: live.author || live.postedBy,
                postedAt: live.postedAt,
                hasFile: live.hasFile !== false,
                mimeType: live.mimeType || null,
                size: live.size,
                payloadId: live.id,
            };
        }
        return {
            id: snap.id,
            name: snap.name,
            author: snap.postedBy || snap.author,
            postedAt: snap.postedAt,
            hasFile: snap.hasFile !== false,
            mimeType: snap.mimeType || null,
            size: snap.size,
            payloadId: snap.payloadId || snap.id,
            missing: true,
        };
    });
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

function dataUrlToBlob(dataUrl) {
    const [meta, data] = String(dataUrl || "").split(",");
    if (!data) return null;
    const isBase64 = /;base64/i.test(meta || "");
    const mime = (meta.match(/^data:([^;]+)/) || [])[1] || "application/octet-stream";
    if (isBase64) {
        const binary = atob(data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        return new Blob([bytes], { type: mime });
    }
    return new Blob([decodeURIComponent(data)], { type: mime });
}

/**
 * Moodle-style file bytes URL (API). Prefer documentViewerUrl() for opening in a tab.
 * @param {{ id: string, name?: string }} doc
 */
export function documentFileViewUrl(doc) {
    const id = encodeURIComponent(String(doc.id || ""));
    const name = encodeURIComponent(sanitizeDocumentName(doc.name) || "document");
    return `${BASE_PATH}/api/documents/files/${id}/${name}`;
}

/**
 * In-app viewer URL — PDFs, Office, and images all open in a browser tab.
 * @param {{ id: string, name?: string }} doc
 */
export function documentViewerUrl(doc) {
    const id = encodeURIComponent(String(doc.id || ""));
    const name = sanitizeDocumentName(doc.name) || "document";
    const q = new URLSearchParams();
    if (name) q.set("name", name);
    const qs = q.toString();
    return `${BASE_PATH}/documents/view/${id}/${qs ? `?${qs}` : ""}`;
}

/**
 * Classify a document for the in-app viewer.
 * @param {string} [name]
 * @param {string} [mime]
 * @returns {'pdf' | 'docx' | 'pptx' | 'image' | 'text' | 'unknown'}
 */
export function detectDocumentKind(name, mime) {
    const n = String(name || "").toLowerCase();
    const m = String(mime || "").toLowerCase();
    if (m.includes("pdf") || n.endsWith(".pdf")) return "pdf";
    if (m.includes("wordprocessingml") || m.includes("msword") || n.endsWith(".docx") || n.endsWith(".doc")) {
        return n.endsWith(".doc") && !n.endsWith(".docx") && !m.includes("wordprocessingml")
            ? "unknown"
            : "docx";
    }
    if (m.includes("presentationml") || m.includes("ms-powerpoint") || n.endsWith(".pptx") || n.endsWith(".ppt")) {
        return n.endsWith(".ppt") && !n.endsWith(".pptx") && !m.includes("presentationml")
            ? "unknown"
            : "pptx";
    }
    if (m.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/i.test(n)) return "image";
    if (m.startsWith("text/") || m.includes("json") || /\.(txt|md|csv|json|log)$/i.test(n)) return "text";
    return "unknown";
}

/**
 * Load a document blob from the files API, falling back to legacy dataUrl payloads.
 * @param {{ id: string, payloadId?: string, name?: string, mimeType?: string }} doc
 */
export async function loadDocumentBlob(doc) {
    const res = await fetch(apiPath(`/api/documents/files/${doc.id}`), { credentials: "include" });
    if (res.ok) {
        const blob = await res.blob();
        const mime = res.headers.get("Content-Type") || blob.type || doc.mimeType || "";
        const typed = mime && blob.type !== mime ? new Blob([blob], { type: mime }) : blob;
        const filename = (() => {
            const cd = res.headers.get("Content-Disposition") || "";
            const star = cd.match(/filename\*=UTF-8''([^;]+)/i);
            if (star?.[1]) {
                try { return decodeURIComponent(star[1]); } catch { /* ignore */ }
            }
            const plain = cd.match(/filename="([^"]+)"/i);
            return plain?.[1] || doc.name || "document";
        })();
        return { blob: typed, name: filename, mimeType: mime };
    }

    const payloads = await getCollection(filesCollectionName(doc.payloadId || doc.id));
    const list = Array.isArray(payloads) ? payloads : [];
    const payload = list.find((p) => sameId(p.id, doc.id)) || list[0];
    if (payload?.dataUrl) {
        const blob = dataUrlToBlob(payload.dataUrl);
        if (blob) {
            return { blob, name: payload.name || doc.name || "document", mimeType: blob.type || doc.mimeType || "" };
        }
    }
    throw new Error("Could not open this document.");
}

/**
 * Open a document in a new tab via the in-app viewer (PDF / Office / images).
 * Uses a same-origin <a> navigation so the click stays synchronous (popup-safe).
 */
export function downloadAndOpenDocument(doc) {
    if (typeof window === "undefined") return;
    const a = document.createElement("a");
    a.href = documentViewerUrl(doc);
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
}

export function triggerBlobDownload(blob, filename) {
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = filename || "document";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
}

export function flattenDocuments(list) {
    return listLibraryItems(list)
        .filter((item) => item.kind === "doc")
        .map(({ kind: _kind, ...doc }) => doc);
}

export function matchesDocumentSearch(doc, query) {
    if (!query) return true;
    return [doc.name, doc.author, fileExtension(doc.name)]
        .some((v) => (v || "").toLowerCase().includes(query));
}
