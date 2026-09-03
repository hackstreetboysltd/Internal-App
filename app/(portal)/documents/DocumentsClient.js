'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPath } from "@/lib/apiPath";
import { get, getCollection, save, saveCollection, watch } from "@/lib/portalApi";
import { useSession, clearActiveModule } from "@/lib/session";
import { nextPortalId, portalNowIso } from "@/lib/portalTime";
import ItemMenu from "@/components/ItemMenu";
import BusyButton from "@/components/BusyButton";
import {
    ITEMS_PER_PAGE,
    MAX_FILE_BYTES,
    UPLOAD_CHUNK_BYTES,
    canManageDocument,
    docIconForName,
    downloadAndOpenDocument,
    filesCollectionName,
    fileExtension,
    formatFileBytes,
    formatDocMeta,
    listLibraryItems,
    matchesLibrarySearch,
    persistableCollection,
    applyDocumentRename,
    removeDocumentFromGroups,
    resolveGroupDocuments,
    isDocumentGroup,
    groupedDocumentIds,
    sanitizeDocumentName,
    sameId,
} from "./documentsHelpers";

const ACCENT = "#2dd4bf";

const ICON_BTN = {
    background: "none",
    border: "none",
    cursor: "pointer",
    color: ACCENT,
    padding: 0,
    boxShadow: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.65,
    transition: "opacity 0.2s, transform 0.2s",
};

const ACCENT_BTN = {
    width: "auto",
    padding: "10px 18px",
    fontSize: "0.9rem",
    background: ACCENT,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: ACCENT,
    color: "#042f2e",
    fontWeight: 700,
};

const SECONDARY_BTN = {
    ...ACCENT_BTN,
    background: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.08)",
    color: "#e5e7eb",
    boxShadow: "none",
};

function IconBtn({ title, onClick, className, style, hoverScale = 1.1, children }) {
    return (
        <button
            type="button"
            className={className}
            title={title}
            style={{ ...ICON_BTN, width: 32, height: 32, fontSize: "1.15rem", ...style }}
            onMouseOver={(e) => {
                e.currentTarget.style.opacity = "1";
                e.currentTarget.style.transform = `scale(${hoverScale})`;
            }}
            onMouseOut={(e) => {
                e.currentTarget.style.opacity = "0.65";
                e.currentTarget.style.transform = "scale(1)";
            }}
            onClick={onClick}
        >
            {children}
        </button>
    );
}

function ModuleModal({ open, shown, onBackdrop, className, children }) {
    if (!open) return null;
    return (
        <div
            className={`${shown ? "modal show" : "modal"}${className ? ` ${className}` : ""}`}
            style={{ display: "flex" }}
            onClick={(e) => {
                if (e.target === e.currentTarget && onBackdrop) onBackdrop();
            }}
        >
            {children}
        </div>
    );
}

function Pager({ start, end, total, page, onPage }) {
    const prevDisabled = page === 1;
    const nextDisabled = end >= total;
    const btn = (disabled) => ({
        width: "auto",
        padding: "4px 8px",
        fontSize: "0.8rem",
        background: disabled ? "rgba(255,255,255,0.05)" : ACCENT,
        border: "none",
        color: disabled ? "#4b5563" : "#042f2e",
        cursor: disabled ? "not-allowed" : "pointer",
        borderRadius: 4,
        fontWeight: 700,
    });
    return (
        <>
            <span>{start}-{end} of {total}</span>
            <div style={{ display: "flex", gap: 6 }}>
                <button type="button" disabled={prevDisabled} style={btn(prevDisabled)} onClick={() => onPage(-1)}>
                    <i className="fa-solid fa-chevron-left"></i>
                </button>
                <button type="button" disabled={nextDisabled} style={btn(nextDisabled)} onClick={() => onPage(1)}>
                    <i className="fa-solid fa-chevron-right"></i>
                </button>
            </div>
        </>
    );
}

function stopTileActivate(e) {
    e.stopPropagation();
}

function DocNameEditor({ initialName, onCommit, onCancel }) {
    const [value, setValue] = useState(initialName);
    const ref = useRef(null);
    const locked = useRef(false);

    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.focus({ preventScroll: true });
        el.select();
        const id = requestAnimationFrame(() => {
            el.focus({ preventScroll: true });
            try {
                el.setSelectionRange(0, el.value.length);
            } catch {
                el.select();
            }
        });
        return () => cancelAnimationFrame(id);
    }, []);

    const finish = (next, cancelled) => {
        if (locked.current) return;
        locked.current = true;
        if (cancelled) onCancel();
        else onCommit(next);
    };

    return (
        <input
            ref={ref}
            className="doc-tile-name-input"
            type="text"
            inputMode="text"
            enterKeyHint="done"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            autoFocus
            value={value}
            aria-label="Document name"
            onChange={(e) => setValue(e.target.value)}
            onClick={stopTileActivate}
            onPointerDown={stopTileActivate}
            onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") {
                    e.preventDefault();
                    finish(value);
                } else if (e.key === "Escape") {
                    e.preventDefault();
                    finish(value, true);
                }
            }}
            onBlur={() => finish(value)}
        />
    );
}

function FileDrop({ inputRef, file, dragOver, setDragOver, onFile, stageState, stageProgress }) {
    const ext = file ? (fileExtension(file.name).toUpperCase() || "FILE") : "";
    const staging = stageState === "uploading";
    const stageReady = stageState === "ready";
    const stageFailed = stageState === "error";
    const pct = Number.isFinite(stageProgress) ? Math.max(0, Math.min(100, stageProgress)) : 0;
    const hint = staging
        ? (pct > 0 ? `Uploading… ${pct}%` : "Uploading to library…")
        : stageFailed
            ? "Upload failed — click to retry"
            : stageReady
                ? "Ready · click to replace"
                : "Click to replace";
    return (
        <label
            className={`docs-drop${dragOver ? " dragover" : ""}${file ? " has-file" : ""}${staging ? " is-staging" : ""}${stageReady ? " is-staged" : ""}${stageFailed ? " is-stage-error" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                onFile(e.dataTransfer.files);
            }}
        >
            {file ? (
                <>
                    <i className={docIconForName(file.name)} aria-hidden="true"></i>
                    <span className="docs-drop-name">{file.name}</span>
                    <span className="docs-drop-meta">{formatFileBytes(file.size)} · {ext}</span>
                    <span className={`docs-drop-hint${staging ? " is-busy" : ""}`}>
                        {staging ? <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" /> : null}
                        {staging ? " " : null}
                        {hint}
                    </span>
                    {staging ? (
                        <span className="docs-drop-progress" aria-hidden="true">
                            <span style={{ width: `${pct}%` }} />
                        </span>
                    ) : null}
                </>
            ) : (
                <>
                    <i className="fa-solid fa-cloud-arrow-up" aria-hidden="true"></i>
                    <span>Drop a file here or click to choose</span>
                </>
            )}
            <input
                ref={inputRef}
                type="file"
                onChange={(e) => onFile(e.target.files)}
            />
        </label>
    );
}

function postDocumentBlob(file, { filename, signal, onProgress }) {
    if (file.size > UPLOAD_CHUNK_BYTES) {
        return postDocumentBlobChunked(file, { filename, signal, onProgress });
    }
    return postDocumentBlobOnce(file, { filename, signal, onProgress });
}

function postDocumentBlobOnce(file, { filename, signal, onProgress }) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const form = new FormData();
        form.append("files", file);
        form.append("filename", filename || file.name || "document");

        xhr.open("POST", apiPath("/api/documents/files"));
        xhr.withCredentials = true;
        xhr.responseType = "text";

        xhr.upload.onprogress = (event) => {
            if (!onProgress || !event.lengthComputable || event.total <= 0) return;
            onProgress(Math.round((event.loaded / event.total) * 100));
        };

        xhr.onload = () => {
            let body = null;
            try { body = JSON.parse(xhr.responseText || "null"); } catch { /* ignore */ }
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve(body);
                return;
            }
            reject(new Error(body?.error || "Upload failed."));
        };
        xhr.onerror = () => reject(new Error("Upload failed."));
        xhr.onabort = () => {
            const err = new Error("Aborted");
            err.name = "AbortError";
            reject(err);
        };

        if (signal) {
            if (signal.aborted) {
                xhr.abort();
                return;
            }
            signal.addEventListener("abort", () => xhr.abort(), { once: true });
        }

        xhr.send(form);
    });
}

function postChunkXhr(form, { signal, onProgress }) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", apiPath("/api/documents/files/chunk"));
        xhr.withCredentials = true;
        xhr.responseType = "text";

        xhr.upload.onprogress = (event) => {
            if (!onProgress || !event.lengthComputable || event.total <= 0) return;
            onProgress(event.loaded, event.total);
        };

        xhr.onload = () => {
            let body = null;
            try { body = JSON.parse(xhr.responseText || "null"); } catch { /* ignore */ }
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve(body);
                return;
            }
            reject(new Error(body?.error || "Upload failed."));
        };
        xhr.onerror = () => reject(new Error("Upload failed."));
        xhr.onabort = () => {
            const err = new Error("Aborted");
            err.name = "AbortError";
            reject(err);
        };

        if (signal) {
            if (signal.aborted) {
                xhr.abort();
                return;
            }
            signal.addEventListener("abort", () => xhr.abort(), { once: true });
        }

        xhr.send(form);
    });
}

async function postDocumentBlobChunked(file, { filename, signal, onProgress }) {
    const totalChunks = Math.ceil(file.size / UPLOAD_CHUNK_BYTES);
    let uploadId = null;
    let completedBytes = 0;
    let lastBody = null;

    const abortUploadSession = () => {
        if (!uploadId) return;
        const id = uploadId;
        uploadId = null;
        fetch(`${apiPath("/api/documents/files/chunk")}?uploadId=${encodeURIComponent(id)}`, {
            method: "DELETE",
            credentials: "include",
        }).catch(() => {});
    };

    if (signal) {
        if (signal.aborted) {
            const err = new Error("Aborted");
            err.name = "AbortError";
            throw err;
        }
        signal.addEventListener("abort", abortUploadSession, { once: true });
    }

    try {
        for (let index = 0; index < totalChunks; index += 1) {
            if (signal?.aborted) {
                const err = new Error("Aborted");
                err.name = "AbortError";
                throw err;
            }

            const start = index * UPLOAD_CHUNK_BYTES;
            const end = Math.min(start + UPLOAD_CHUNK_BYTES, file.size);
            const slice = file.slice(start, end);
            const form = new FormData();
            form.append("chunk", slice, file.name || "document");
            form.append("chunkIndex", String(index));
            form.append("chunkTotal", String(totalChunks));
            form.append("filename", filename || file.name || "document");
            form.append("mimeType", file.type || "");
            form.append("size", String(file.size));
            if (uploadId) form.append("uploadId", uploadId);

            const chunkSize = end - start;
            lastBody = await postChunkXhr(form, {
                signal,
                onProgress: (loaded, total) => {
                    if (!onProgress || !total) return;
                    const overall = completedBytes + Math.min(loaded, chunkSize);
                    onProgress(Math.min(100, Math.round((overall / file.size) * 100)));
                },
            });
            uploadId = lastBody?.uploadId || uploadId;
            completedBytes = end;
            if (onProgress) onProgress(Math.min(100, Math.round((completedBytes / file.size) * 100)));
        }

        if (!lastBody?.done || !Array.isArray(lastBody?.files) || !lastBody.files[0]?.id) {
            throw new Error("Upload failed.");
        }
        return lastBody;
    } catch (err) {
        if (err?.name !== "AbortError") abortUploadSession();
        throw err;
    }
}

function SaveAsInput({ value, onChange, onSubmit }) {
    const ref = useRef(null);

    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.focus({ preventScroll: true });
        el.select();
        const id = requestAnimationFrame(() => {
            el.focus({ preventScroll: true });
            try {
                el.setSelectionRange(0, el.value.length);
            } catch {
                el.select();
            }
        });
        return () => cancelAnimationFrame(id);
    }, []);

    return (
        <label className="docs-saveas">
            <span>Save as</span>
            <input
                ref={ref}
                type="text"
                inputMode="text"
                enterKeyHint="done"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                autoFocus
                value={value}
                aria-label="Save as"
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter") {
                        e.preventDefault();
                        if (onSubmit) onSubmit();
                    }
                }}
            />
        </label>
    );
}

export default function DocumentsClient() {
    const router = useRouter();
    const { actor } = useSession();
    const actorRef = useRef(actor);
    useEffect(() => { actorRef.current = actor; }, [actor]);

    const [loading, setLoading] = useState(true);
    const [records, setRecords] = useState([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const [refreshSpin, setRefreshSpin] = useState(false);

    const [uploadOpen, setUploadOpen] = useState(false);
    const [uploadShown, setUploadShown] = useState(false);
    const [infoOpen, setInfoOpen] = useState(false);
    const [infoShown, setInfoShown] = useState(false);
    const [groupSaveOpen, setGroupSaveOpen] = useState(false);
    const [groupSaveShown, setGroupSaveShown] = useState(false);
    const [groupViewOpen, setGroupViewOpen] = useState(false);
    const [groupViewShown, setGroupViewShown] = useState(false);
    const [viewingGroup, setViewingGroup] = useState(null);
    const [groupEditing, setGroupEditing] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [confirmShown, setConfirmShown] = useState(false);
    const [confirmBusy, setConfirmBusy] = useState(false);
    const [confirmConfig, setConfirmConfig] = useState(null);

    const [grouping, setGrouping] = useState(false);
    const [selectedIds, setSelectedIds] = useState(() => new Set());
    const [addingToGroupId, setAddingToGroupId] = useState(null);
    const [groupName, setGroupName] = useState("");
    const [savingGroup, setSavingGroup] = useState(false);

    const [pickedFile, setPickedFile] = useState(null);
    const [saveAsName, setSaveAsName] = useState("");
    const [dropOver, setDropOver] = useState(false);
    const [saving, setSaving] = useState(false);
    const [stageState, setStageState] = useState("idle");
    const [stageProgress, setStageProgress] = useState(0);
    const [renamingId, setRenamingId] = useState(null);
    const [openingId, setOpeningId] = useState(null);
    const uploadFileRef = useRef(null);
    const stageGenRef = useRef(0);
    const stagedIdRef = useRef(null);
    const stagedMetaRef = useRef(null);
    const stagePromiseRef = useRef(null);
    const stageAbortRef = useRef(null);

    const timers = useRef([]);
    const later = (fn, ms) => {
        const id = setTimeout(fn, ms);
        timers.current.push(id);
        return id;
    };
    useEffect(() => () => timers.current.forEach(clearTimeout), []);

    const deleteStagedBlob = (id) => {
        if (!id) return;
        fetch(apiPath(`/api/documents/files/${id}`), {
            method: "DELETE",
            credentials: "include",
        }).catch(() => {});
    };

    const discardStagedUpload = useCallback(() => {
        stageGenRef.current += 1;
        if (stageAbortRef.current) {
            stageAbortRef.current.abort();
            stageAbortRef.current = null;
        }
        stagePromiseRef.current = null;
        stagedMetaRef.current = null;
        const id = stagedIdRef.current;
        stagedIdRef.current = null;
        setStageState("idle");
        setStageProgress(0);
        deleteStagedBlob(id);
    }, []);

    const releaseStagedUpload = useCallback(() => {
        stageGenRef.current += 1;
        stageAbortRef.current = null;
        stagePromiseRef.current = null;
        stagedIdRef.current = null;
        stagedMetaRef.current = null;
        setStageState("idle");
        setStageProgress(0);
    }, []);

    useEffect(() => () => {
        if (stageAbortRef.current) stageAbortRef.current.abort();
        deleteStagedBlob(stagedIdRef.current);
        stagedIdRef.current = null;
    }, []);

    const beginStagedUpload = useCallback((file) => {
        discardStagedUpload();
        const gen = stageGenRef.current;
        const ac = new AbortController();
        stageAbortRef.current = ac;
        setStageState("uploading");
        setStageProgress(0);

        const promise = (async () => {
            const body = await postDocumentBlob(file, {
                filename: file.name || "document",
                signal: ac.signal,
                onProgress: (pct) => {
                    if (gen === stageGenRef.current) setStageProgress(pct);
                },
            });
            const saved = Array.isArray(body?.files) ? body.files : [];
            const row = saved[0];
            if (!row?.id) throw new Error("Upload failed.");

            if (gen !== stageGenRef.current) {
                deleteStagedBlob(row.id);
                return null;
            }

            stagedIdRef.current = row.id;
            stagedMetaRef.current = row;
            stageAbortRef.current = null;
            setStageProgress(100);
            setStageState("ready");
            return row;
        })().catch((e) => {
            if (e?.name === "AbortError") return null;
            if (gen === stageGenRef.current) {
                stagedIdRef.current = null;
                stagedMetaRef.current = null;
                stageAbortRef.current = null;
                setStageProgress(0);
                setStageState("error");
            }
            throw e;
        });

        stagePromiseRef.current = promise;
        return promise;
    }, [discardStagedUpload]);

    const loadDocuments = useCallback(async () => {
        setLoading(true);
        try {
            const list = await get("documents");
            setRecords(Array.isArray(list) ? list : []);
        } catch (e) {
            console.error("Error loading documents:", e);
            setRecords([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const unsub = watch("documents", (list) => {
            setRecords(Array.isArray(list) ? list : []);
            setLoading(false);
        }, {
            onError: (e) => {
                console.error("Error loading documents:", e);
                setRecords([]);
                setLoading(false);
            },
        });
        return unsub;
    }, []);

    // Warm local disk cache so large Neon bytea files open instantly on click.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                await fetch(apiPath("/api/documents/files/hydrate"), {
                    method: "POST",
                    credentials: "include",
                });
            } catch (e) {
                if (!cancelled) console.warn("Document disk cache warm failed:", e);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const saveDocuments = async (list) => {
        try {
            await save("documents", list);
        } catch (e) {
            console.error("Error saving documents:", e);
            alert("Failed to save documents to the database.");
            throw e;
        }
    };

    const lastSearch = useRef("");
    useEffect(() => {
        const next = searchQuery.toLowerCase().trim();
        if (next !== lastSearch.current) {
            lastSearch.current = next;
            setCurrentPage(1);
        }
    }, [searchQuery]);

    const q = searchQuery.toLowerCase().trim();
    const libraryItems = useMemo(() => listLibraryItems(records), [records]);
    const filtered = useMemo(() => {
        const matched = libraryItems.filter((item) => matchesLibrarySearch(item, q));
        // Groups cannot be nested — hide folder tiles while picking documents.
        if (grouping) return matched.filter((item) => item.kind !== "group");
        return matched;
    }, [libraryItems, q, grouping]);
    const totalCount = filtered.length;
    const maxPage = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE));
    const page = currentPage > maxPage ? maxPage : currentPage;
    const startIdx = (page - 1) * ITEMS_PER_PAGE;
    const paginated = filtered.slice(startIdx, startIdx + ITEMS_PER_PAGE);
    const actorName = (actor?.name || "").toLowerCase();
    const selectedDocs = useMemo(() => {
        if (!selectedIds.size) return [];
        return libraryItems.filter((item) => item.kind === "doc" && selectedIds.has(String(item.id)));
    }, [libraryItems, selectedIds]);
    const addingToGroup = useMemo(() => {
        if (!addingToGroupId) return null;
        const fromLibrary = libraryItems.find((item) => item.kind === "group" && sameId(item.id, addingToGroupId));
        if (fromLibrary) return fromLibrary;
        return records.find((item) => isDocumentGroup(item) && sameId(item.id, addingToGroupId)) || null;
    }, [addingToGroupId, libraryItems, records]);
    const existingGroupDocs = useMemo(
        () => (addingToGroup ? resolveGroupDocuments(addingToGroup, records).filter((doc) => !doc.missing) : []),
        [addingToGroup, records],
    );
    const savePreviewDocs = useMemo(() => {
        if (!addingToGroup) return selectedDocs;
        const existingIds = new Set(existingGroupDocs.map((doc) => String(doc.id)));
        const newly = selectedDocs.filter((doc) => !existingIds.has(String(doc.id)));
        return [...existingGroupDocs, ...newly];
    }, [addingToGroup, existingGroupDocs, selectedDocs]);
    const viewingGroupDocs = useMemo(
        () => (viewingGroup ? resolveGroupDocuments(viewingGroup, records) : []),
        [viewingGroup, records],
    );

    const exitGrouping = useCallback(() => {
        setGrouping(false);
        setSelectedIds(new Set());
        setAddingToGroupId(null);
    }, []);

    useEffect(() => {
        if (!grouping) return undefined;
        const onKey = (e) => {
            if (e.key === "Escape" && !groupSaveOpen) exitGrouping();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [grouping, groupSaveOpen, exitGrouping]);

    const closeModule = () => {
        clearActiveModule();
        router.push("/");
    };

    const openModal = (setOpen, setShown) => {
        setOpen(true);
        later(() => setShown(true), 10);
    };
    const closeModal = (setOpen, setShown, after) => {
        setShown(false);
        later(() => {
            setOpen(false);
            if (after) after();
        }, 300);
    };

    const resetUploadForm = () => {
        discardStagedUpload();
        setPickedFile(null);
        setSaveAsName("");
        setDropOver(false);
        if (uploadFileRef.current) uploadFileRef.current.value = "";
    };

    const takeFile = (fileList) => {
        const file = Array.from(fileList || [])[0];
        if (!file) return;
        if (file.size > MAX_FILE_BYTES) {
            alert("This file must be 25 MB or smaller.");
            return;
        }
        setPickedFile(file);
        setSaveAsName(file.name || "");
        if (uploadFileRef.current) uploadFileRef.current.value = "";
        beginStagedUpload(file).catch((e) => {
            console.error(e);
        });
    };

    const uploadDocuments = async () => {
        if (saving) return;
        if (!pickedFile) return alert("Choose a file to upload.");
        if (stageState === "error") return alert("File upload failed. Choose the file again.");
        if (stageState !== "ready" && !stagePromiseRef.current) {
            return alert("File is still uploading. Wait until it shows Ready.");
        }
        const displayName = sanitizeDocumentName(saveAsName) || pickedFile.name || "document";
        const current = actorRef.current || { name: "A Team Member", email: "" };
        setSaving(true);
        try {
            let file = stagedMetaRef.current;
            if (!file?.id && stagePromiseRef.current) {
                file = await stagePromiseRef.current;
            }
            if (!file?.id) throw new Error("Upload failed.");

            const uploadedName = sanitizeDocumentName(file.name || "") || file.name || "";
            if (displayName !== uploadedName) {
                const renameRes = await fetch(apiPath(`/api/documents/files/${file.id}`), {
                    method: "PATCH",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ filename: displayName }),
                });
                let renameBody = null;
                try { renameBody = await renameRes.json(); } catch { /* ignore */ }
                if (!renameRes.ok) {
                    throw new Error(renameBody?.error || "Could not save the file name.");
                }
            }

            const list = persistableCollection(await get("documents"));
            const now = portalNowIso();
            list.push({
                id: file.id,
                name: displayName,
                author: current.name,
                postedAt: now,
                hasFile: true,
                mimeType: file.mimeType || null,
                size: file.size,
            });
            await saveDocuments(list);
            releaseStagedUpload();
            setPickedFile(null);
            setSaveAsName("");
            setDropOver(false);
            if (uploadFileRef.current) uploadFileRef.current.value = "";
            closeModal(setUploadOpen, setUploadShown);
        } catch (e) {
            console.error(e);
            alert(e.message || "Could not upload this file.");
        } finally {
            setSaving(false);
        }
    };

    const closeConfirm = useCallback((after) => {
        setConfirmShown(false);
        later(() => {
            setConfirmOpen(false);
            setConfirmBusy(false);
            setConfirmConfig(null);
            if (after) after();
        }, 300);
    }, []);

    const askConfirm = useCallback((config) => {
        setConfirmConfig(config);
        setConfirmBusy(false);
        setConfirmOpen(true);
        later(() => setConfirmShown(true), 10);
    }, []);

    const runConfirm = async () => {
        if (!confirmConfig?.onConfirm || confirmBusy) return;
        setConfirmBusy(true);
        try {
            await confirmConfig.onConfirm();
            closeConfirm();
        } catch (e) {
            console.error(e);
            setConfirmBusy(false);
            alert(e.message || "Something went wrong.");
        }
    };

    const deleteDocument = async (doc) => {
        const current = actorRef.current || { name: "A Team Member", email: "" };
        if (!canManageDocument(doc, current.name)) {
            alert("Permission Denied: You can only delete documents you uploaded.");
            return;
        }
        askConfirm({
            title: "Remove document",
            message: `Remove "${doc.name || "this document"}"? This deletes the file from the library.`,
            confirmLabel: "Remove",
            danger: true,
            onConfirm: async () => {
                const list = persistableCollection(await get("documents"));
                const owned = list.find((item) => sameId(item.id, doc.id));
                const blobRes = await fetch(apiPath(`/api/documents/files/${doc.id}`), {
                    method: "DELETE",
                    credentials: "include",
                });
                if (blobRes.status === 403) {
                    throw new Error("Permission Denied: You can only delete documents you uploaded.");
                }
                if (owned) {
                    await saveCollection(filesCollectionName(doc.id), []);
                    const withoutDoc = list.filter((item) => !sameId(item.id, doc.id));
                    await saveDocuments(removeDocumentFromGroups(withoutDoc, doc.id));
                } else {
                    const parent = list.find((item) => sameId(item.id, doc.payloadId));
                    if (!parent) return;
                    parent.documents = (Array.isArray(parent.documents) ? parent.documents : [])
                        .filter((item) => !sameId(item.id, doc.id));
                    const payloads = (await getCollection(filesCollectionName(parent.id)) || [])
                        .filter((p) => !sameId(p.id, doc.id));
                    await saveCollection(filesCollectionName(parent.id), payloads);
                    await saveDocuments(removeDocumentFromGroups(list, doc.id));
                }
            },
        });
    };

    const renameDocument = async (doc, rawName) => {
        setRenamingId(null);
        const name = sanitizeDocumentName(rawName);
        if (!name || name === doc.name) return;
        const current = actorRef.current || { name: "A Team Member", email: "" };
        if (!canManageDocument(doc, current.name)) {
            alert("Permission Denied: You can only rename documents you uploaded.");
            return;
        }
        try {
            const list = persistableCollection(await get("documents"));
            await saveDocuments(applyDocumentRename(list, doc, name));
            const fileRes = await fetch(apiPath(`/api/documents/files/${doc.id}`), {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ filename: name }),
            });
            if (fileRes.status === 403) {
                alert("Permission Denied: You can only rename documents you uploaded.");
            }
        } catch (e) {
            console.error(e);
            alert("Could not rename this document.");
        }
    };

    const openDocument = (doc) => {
        if (!doc?.id || openingId || doc.missing) return;
        setOpeningId(doc.id);
        try {
            downloadAndOpenDocument(doc);
        } catch (e) {
            console.error(e);
            alert(e.message || "Could not open this document.");
        } finally {
            // Clear spinner on next frame — open is sync navigation to the file URL.
            later(() => setOpeningId(null), 0);
        }
    };

    const toggleDocSelected = (docId) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            const key = String(docId);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const beginGrouping = () => {
        setAddingToGroupId(null);
        setSelectedIds(new Set());
        setGrouping(true);
    };

    const beginAddToGroup = (group) => {
        if (!group?.id) return;
        const groupId = group.id;
        const name = group.name || "";
        closeModal(setGroupViewOpen, setGroupViewShown, () => {
            setViewingGroup(null);
            setGroupEditing(false);
            setAddingToGroupId(groupId);
            setGroupName(name);
            setSelectedIds(new Set());
            setGrouping(true);
        });
    };

    const openGroupSaveModal = () => {
        if (!selectedIds.size) {
            alert("Select at least one document to group.");
            return;
        }
        if (addingToGroup) setGroupName(addingToGroup.name || "");
        else setGroupName("");
        openModal(setGroupSaveOpen, setGroupSaveShown);
    };

    const resetGroupSaveForm = () => {
        setGroupName("");
        setSavingGroup(false);
    };

    const docToSnap = (doc, list) => {
        const live = list.find((item) => !isDocumentGroup(item) && sameId(item.id, doc.id));
        return {
            id: doc.id,
            name: live?.name || doc.name,
            postedBy: live?.author || live?.postedBy || doc.author || doc.postedBy,
            postedAt: live?.postedAt || doc.postedAt,
            hasFile: live ? live.hasFile !== false : doc.hasFile !== false,
            mimeType: live?.mimeType || doc.mimeType || null,
            size: live?.size ?? doc.size,
        };
    };

    const saveGroup = async () => {
        if (savingGroup) return;
        if (!selectedDocs.length) {
            alert("Select at least one document to group.");
            return;
        }
        const name = sanitizeDocumentName(groupName);
        if (!name) {
            alert("Enter a name for this group.");
            return;
        }
        const current = actorRef.current || { name: "A Team Member", email: "" };
        setSavingGroup(true);
        try {
            const list = persistableCollection(await get("documents"));

            if (addingToGroupId) {
                const owned = list.find((item) => isDocumentGroup(item) && sameId(item.id, addingToGroupId));
                if (!owned) {
                    alert("That group no longer exists.");
                    return;
                }
                if (!canManageDocument(owned, current.name)) {
                    alert("Permission Denied: You can only add documents to groups you created.");
                    return;
                }
                const existingIds = new Set(
                    (Array.isArray(owned.documents) ? owned.documents : []).map((doc) => String(doc.id)),
                );
                const newSnaps = [];
                for (const doc of selectedDocs) {
                    if (existingIds.has(String(doc.id))) continue;
                    newSnaps.push(docToSnap(doc, list));
                }
                if (!newSnaps.length) {
                    alert("Select at least one new document to add.");
                    return;
                }
                owned.name = name;
                owned.documents = [...(Array.isArray(owned.documents) ? owned.documents : []), ...newSnaps];
                await saveDocuments(list);
            } else {
                const alreadyGrouped = groupedDocumentIds(list);
                const snaps = [];
                for (const doc of selectedDocs) {
                    if (alreadyGrouped.has(String(doc.id))) continue;
                    snaps.push(docToSnap(doc, list));
                }
                if (!snaps.length) {
                    alert("Those documents are already in a group.");
                    return;
                }
                list.push({
                    id: nextPortalId(),
                    kind: "group",
                    name,
                    author: current.name,
                    postedAt: portalNowIso(),
                    documents: snaps,
                });
                await saveDocuments(list);
            }

            exitGrouping();
            closeModal(setGroupSaveOpen, setGroupSaveShown, resetGroupSaveForm);
        } catch (e) {
            console.error(e);
            alert(e.message || "Could not save this group.");
        } finally {
            setSavingGroup(false);
        }
    };

    const openGroupView = (group) => {
        if (grouping) return;
        setGroupEditing(false);
        setViewingGroup(group);
        openModal(setGroupViewOpen, setGroupViewShown);
    };

    const closeGroupView = () => {
        closeModal(setGroupViewOpen, setGroupViewShown, () => {
            setViewingGroup(null);
            setGroupEditing(false);
        });
    };

    const removeDocFromGroup = (group, doc) => {
        const current = actorRef.current || { name: "A Team Member", email: "" };
        if (!canManageDocument(group, current.name)) {
            alert("Permission Denied: You can only edit groups you created.");
            return;
        }
        askConfirm({
            title: "Remove from group",
            message: `Remove "${doc.name || "this document"}" from the group? The file will return to the library.`,
            confirmLabel: "Remove",
            danger: true,
            onConfirm: async () => {
                const list = persistableCollection(await get("documents"));
                const owned = list.find((item) => isDocumentGroup(item) && sameId(item.id, group.id));
                if (!owned) return;
                const nextDocs = (Array.isArray(owned.documents) ? owned.documents : [])
                    .filter((entry) => !sameId(entry.id, doc.id));
                owned.documents = nextDocs;
                await saveDocuments(list);
                if (viewingGroup && sameId(viewingGroup.id, group.id)) {
                    setViewingGroup({
                        ...viewingGroup,
                        documents: nextDocs,
                        count: nextDocs.length,
                    });
                }
            },
        });
    };

    const deleteGroup = (group) => {
        const current = actorRef.current || { name: "A Team Member", email: "" };
        if (!canManageDocument(group, current.name)) {
            alert("Permission Denied: You can only delete groups you created.");
            return;
        }
        askConfirm({
            title: "Remove group",
            message: `Remove group "${group.name || "Untitled"}"? Documents inside will return to the library.`,
            confirmLabel: "Remove",
            danger: true,
            onConfirm: async () => {
                const list = persistableCollection(await get("documents"));
                await saveDocuments(list.filter((item) => !sameId(item.id, group.id)));
                if (viewingGroup && sameId(viewingGroup.id, group.id)) closeGroupView();
            },
        });
    };

    const renameGroup = async (group, rawName) => {
        setRenamingId(null);
        const name = sanitizeDocumentName(rawName);
        if (!name || name === group.name) return;
        const current = actorRef.current || { name: "A Team Member", email: "" };
        if (!canManageDocument(group, current.name)) {
            alert("Permission Denied: You can only rename groups you created.");
            return;
        }
        try {
            const list = persistableCollection(await get("documents"));
            const owned = list.find((item) => sameId(item.id, group.id));
            if (!owned) return;
            owned.name = name;
            await saveDocuments(list);
            if (viewingGroup && sameId(viewingGroup.id, group.id)) {
                setViewingGroup({ ...viewingGroup, name });
            }
        } catch (e) {
            console.error(e);
            alert("Could not rename this group.");
        }
    };

    const refreshDocs = async () => {
        setRefreshSpin(true);
        try {
            await loadDocuments();
        } catch (e) {
            console.error("Error during documents refresh:", e);
        } finally {
            later(() => setRefreshSpin(false), 500);
        }
    };

    return (
        <div className="documents-module">
            <div className="container">
                <div
                    className="header-container"
                    style={{ display: "grid", gridTemplateColumns: "40px 1fr auto", alignItems: "center", marginBottom: 24, borderBottom: "1px solid var(--border-color)", paddingBottom: 16 }}
                >
                    <div></div>
                    <h2 style={{ margin: "0 auto", borderBottom: "none", paddingBottom: 0, fontSize: "1.8rem", display: "flex", alignItems: "center", gap: 10 }}>
                        Documents
                        <IconBtn title="About this module" onClick={() => openModal(setInfoOpen, setInfoShown)} style={{ width: "auto", height: "auto", fontSize: "1rem" }} hoverScale={1.15}>
                            <i className="fa-solid fa-circle-info"></i>
                        </IconBtn>
                    </h2>
                    <div className="header-actions-right" style={{ display: "flex", alignItems: "center", gap: 4, justifySelf: "end" }}>
                        <IconBtn className="refresh-btn" title="Refresh documents" onClick={refreshDocs}>
                            <i className={`fa-solid fa-arrows-rotate${refreshSpin ? " fa-spin" : ""}`}></i>
                        </IconBtn>
                        <IconBtn className="close-module-btn" title="Close module" onClick={closeModule}>
                            <i className="fa-solid fa-xmark"></i>
                        </IconBtn>
                    </div>
                </div>

                <div className="header-actions" style={{ marginBottom: grouping ? 10 : 24 }}>
                    <div className="search-input-wrapper">
                        <input
                            type="text"
                            placeholder="Search keyword..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <div className="header-actions-primary">
                        <button
                            type="button"
                            className={grouping ? undefined : "secondary-btn"}
                            style={grouping ? ACCENT_BTN : SECONDARY_BTN}
                            onClick={() => {
                                if (grouping) openGroupSaveModal();
                                else beginGrouping();
                            }}
                        >
                            {grouping ? "Save" : (
                                <>
                                    <i className="fa-solid fa-plus" aria-hidden="true"></i>
                                    Group
                                </>
                            )}
                        </button>
                        {grouping ? (
                            <button
                                type="button"
                                className="secondary-btn"
                                style={SECONDARY_BTN}
                                onClick={exitGrouping}
                            >
                                Cancel
                            </button>
                        ) : null}
                        <button
                            type="button"
                            style={ACCENT_BTN}
                            disabled={grouping}
                            onClick={() => {
                                resetUploadForm();
                                openModal(setUploadOpen, setUploadShown);
                            }}
                        >
                            Upload
                        </button>
                    </div>
                </div>

                {grouping ? (
                    <div className="docs-select-bar" aria-live="polite">
                        {addingToGroup
                            ? `Adding to ${addingToGroup.name || "group"} · ${selectedIds.size} selected`
                            : `${selectedIds.size} selected`}
                    </div>
                ) : null}

                {loading ? (
                    <div className="docs-skeleton" aria-busy="true" aria-label="Loading documents">
                        <div className="skel-tile"></div><div className="skel-tile"></div><div className="skel-tile"></div>
                        <div className="skel-tile"></div><div className="skel-tile"></div><div className="skel-tile"></div>
                    </div>
                ) : (
                    <>
                        <div className={`doc-grid${grouping ? " is-grouping" : ""}`}>
                            {totalCount === 0 ? (
                                <div className="empty-state">
                                    <p>{q ? "No documents match your search query." : "No documents yet. Click \"Upload\" to add files."}</p>
                                </div>
                            ) : paginated.map((item) => {
                                if (item.kind === "group") {
                                    const isOwner = canManageDocument(item, actorName);
                                    const renaming = renamingId === item.id;
                                    return (
                                        <div
                                            key={`group-${item.id}`}
                                            className={`doc-tile is-group${renaming ? " is-menu-open" : ""}`}
                                            role={renaming || grouping ? undefined : "button"}
                                            tabIndex={renaming || grouping ? -1 : 0}
                                            aria-label={`Group ${item.name || "Untitled"}`}
                                            onClick={() => {
                                                if (renaming || grouping) return;
                                                openGroupView(item);
                                            }}
                                            onKeyDown={(e) => {
                                                if (renaming || grouping) return;
                                                if (e.key === "Enter" || e.key === " ") {
                                                    e.preventDefault();
                                                    openGroupView(item);
                                                }
                                            }}
                                        >
                                            {isOwner && !grouping ? (
                                                <span className="doc-tile-actions">
                                                    <ItemMenu
                                                        items={[
                                                            { label: "Rename", onClick: () => setRenamingId(item.id) },
                                                            { label: "Delete", onClick: () => deleteGroup(item), danger: true },
                                                        ]}
                                                    />
                                                </span>
                                            ) : null}
                                            <span className="doc-tile-icon">
                                                <i className="fa-solid fa-folder" aria-hidden="true"></i>
                                            </span>
                                            {renaming ? (
                                                <DocNameEditor
                                                    initialName={item.name || ""}
                                                    onCommit={(next) => renameGroup(item, next)}
                                                    onCancel={() => setRenamingId(null)}
                                                />
                                            ) : (
                                                <span className="doc-tile-name">{item.name}</span>
                                            )}
                                            <span className="doc-tile-meta">
                                                {item.count || 0} file{(item.count || 0) === 1 ? "" : "s"}
                                                {item.author ? ` · ${item.author}` : ""}
                                            </span>
                                        </div>
                                    );
                                }

                                const doc = item;
                                const isOwner = canManageDocument(doc, actorName);
                                const renaming = renamingId === doc.id;
                                const selected = selectedIds.has(String(doc.id));
                                return (
                                    <div
                                        key={doc.id}
                                        className={`doc-tile${renaming ? " is-menu-open" : ""}${openingId && sameId(openingId, doc.id) ? " is-opening" : ""}${grouping && selected ? " is-selected" : ""}`}
                                        role={renaming ? undefined : "button"}
                                        tabIndex={renaming ? -1 : 0}
                                        aria-busy={openingId && sameId(openingId, doc.id) ? true : undefined}
                                        aria-pressed={grouping ? selected : undefined}
                                        onClick={() => {
                                            if (renaming || openingId) return;
                                            if (grouping) {
                                                toggleDocSelected(doc.id);
                                                return;
                                            }
                                            openDocument(doc);
                                        }}
                                        onKeyDown={(e) => {
                                            if (renaming || openingId) return;
                                            if (e.key === "Enter" || e.key === " ") {
                                                e.preventDefault();
                                                if (grouping) toggleDocSelected(doc.id);
                                                else openDocument(doc);
                                            }
                                        }}
                                    >
                                        {grouping ? (
                                            <label
                                                className="doc-tile-check"
                                                onClick={stopTileActivate}
                                                onPointerDown={stopTileActivate}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={selected}
                                                    onChange={() => toggleDocSelected(doc.id)}
                                                    aria-label={`Select ${doc.name || "document"}`}
                                                />
                                            </label>
                                        ) : isOwner ? (
                                            <span className="doc-tile-actions">
                                                <ItemMenu
                                                    items={[
                                                        { label: "Rename", onClick: () => setRenamingId(doc.id) },
                                                        { label: "Delete", onClick: () => deleteDocument(doc), danger: true },
                                                    ]}
                                                />
                                            </span>
                                        ) : null}
                                        <span className="doc-tile-icon">
                                            <i
                                                className={
                                                    openingId && sameId(openingId, doc.id)
                                                        ? "fa-solid fa-spinner fa-spin"
                                                        : docIconForName(doc.name)
                                                }
                                                aria-hidden="true"
                                            ></i>
                                        </span>
                                        {renaming ? (
                                            <DocNameEditor
                                                initialName={doc.name || ""}
                                                onCommit={(next) => renameDocument(doc, next)}
                                                onCancel={() => setRenamingId(null)}
                                            />
                                        ) : (
                                            <span className="doc-tile-name">{doc.name}</span>
                                        )}
                                        <span className="doc-tile-meta">{formatDocMeta(doc)}</span>
                                    </div>
                                );
                            })}
                        </div>
                        {totalCount > 0 ? (
                            <div className="workspace-pagination">
                                <Pager start={startIdx + 1} end={Math.min(startIdx + ITEMS_PER_PAGE, totalCount)} total={totalCount} page={page} onPage={(d) => setCurrentPage(page + d)} />
                            </div>
                        ) : null}
                    </>
                )}
            </div>

            <ModuleModal open={uploadOpen} shown={uploadShown} onBackdrop={() => closeModal(setUploadOpen, setUploadShown, resetUploadForm)}>
                <div className="modal-content">
                    <div className="modal-header">
                        <h3 style={{ margin: "0 auto" }}>Upload</h3>
                        <span className="close-btn" onClick={() => closeModal(setUploadOpen, setUploadShown, resetUploadForm)}>&times;</span>
                    </div>
                    <div className="modal-body">
                        <FileDrop
                            inputRef={uploadFileRef}
                            file={pickedFile}
                            dragOver={dropOver}
                            setDragOver={setDropOver}
                            onFile={takeFile}
                            stageState={pickedFile ? stageState : "idle"}
                            stageProgress={stageProgress}
                        />
                        {pickedFile ? (
                            <SaveAsInput
                                key={`${pickedFile.name}-${pickedFile.size}-${pickedFile.lastModified}`}
                                value={saveAsName}
                                onChange={setSaveAsName}
                                onSubmit={() => { if (!saving && stageState === "ready") uploadDocuments(); }}
                            />
                        ) : null}
                        <BusyButton
                            type="button"
                            busy={saving || stageState === "uploading"}
                            busyLabel={
                                saving
                                    ? "Saving…"
                                    : (stageProgress > 0 ? `Uploading… ${stageProgress}%` : "Uploading…")
                            }
                            onClick={uploadDocuments}
                            disabled={!pickedFile || stageState !== "ready"}
                        >
                            Upload
                        </BusyButton>
                    </div>
                </div>
            </ModuleModal>

            <ModuleModal
                open={groupSaveOpen}
                shown={groupSaveShown}
                onBackdrop={() => closeModal(setGroupSaveOpen, setGroupSaveShown, resetGroupSaveForm)}
            >
                <div className="modal-content modal-content--docs">
                    <div className="modal-header">
                        <h3 style={{ margin: "0 auto" }}>{addingToGroup ? "Update group" : "Save group"}</h3>
                        <span className="close-btn" onClick={() => closeModal(setGroupSaveOpen, setGroupSaveShown, resetGroupSaveForm)}>&times;</span>
                    </div>
                    <div className="modal-body">
                        {savePreviewDocs.length ? (
                            <div className="doc-grid doc-grid--modal" aria-label={addingToGroup ? "Group documents" : "Selected documents"}>
                                {savePreviewDocs.map((doc) => {
                                    const isNew = addingToGroup && selectedIds.has(String(doc.id));
                                    return (
                                        <div key={doc.id} className={`doc-tile${isNew ? " is-new-in-group" : ""}`}>
                                            <span className="doc-tile-icon">
                                                <i className={docIconForName(doc.name)} aria-hidden="true"></i>
                                            </span>
                                            <span className="doc-tile-name">{doc.name}</span>
                                            <span className="doc-tile-meta">
                                                {isNew ? "New · " : ""}{formatDocMeta(doc)}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <p className="group-save-empty">No documents selected.</p>
                        )}
                        <SaveAsInput
                            key={`group-${addingToGroupId || "new"}-${selectedDocs.map((d) => d.id).join("-")}`}
                            value={groupName}
                            onChange={setGroupName}
                            onSubmit={() => { if (!savingGroup) saveGroup(); }}
                        />
                        <BusyButton
                            type="button"
                            busy={savingGroup}
                            busyLabel="Saving…"
                            onClick={saveGroup}
                            disabled={!selectedDocs.length || !sanitizeDocumentName(groupName)}
                        >
                            Save
                        </BusyButton>
                    </div>
                </div>
            </ModuleModal>

            <ModuleModal open={groupViewOpen} shown={groupViewShown} onBackdrop={closeGroupView}>
                <div className="modal-content modal-content--docs">
                    <div className="modal-header">
                        <h3 style={{ margin: "0 auto", display: "flex", alignItems: "center", gap: 8 }}>
                            <i className="fa-solid fa-folder" style={{ color: ACCENT }}></i>
                            {viewingGroup?.name || "Group"}
                        </h3>
                        <div className="modal-header-actions">
                            {viewingGroup && canManageDocument(viewingGroup, actorName) ? (
                                <button
                                    type="button"
                                    className={`group-edit-toggle${groupEditing ? " is-active" : ""}`}
                                    title={groupEditing ? "Done editing" : "Edit group"}
                                    aria-pressed={groupEditing}
                                    onClick={() => setGroupEditing((v) => !v)}
                                >
                                    <i className="fa-solid fa-pen" aria-hidden="true"></i>
                                </button>
                            ) : null}
                            <span className="close-btn" onClick={closeGroupView}>&times;</span>
                        </div>
                    </div>
                    <div className="modal-body">
                        {viewingGroupDocs.length ? (
                            <div className={`doc-grid doc-grid--modal${groupEditing ? " is-editing" : ""}`} aria-label="Group documents">
                                {viewingGroupDocs.map((doc) => (
                                    <div
                                        key={doc.id}
                                        className={`doc-tile${doc.missing ? " is-missing" : ""}${openingId && sameId(openingId, doc.id) ? " is-opening" : ""}`}
                                        role={doc.missing ? undefined : "button"}
                                        tabIndex={doc.missing ? -1 : 0}
                                        aria-disabled={doc.missing ? true : undefined}
                                        onClick={() => {
                                            if (!doc.missing) openDocument(doc);
                                        }}
                                        onKeyDown={(e) => {
                                            if (doc.missing) return;
                                            if (e.key === "Enter" || e.key === " ") {
                                                e.preventDefault();
                                                openDocument(doc);
                                            }
                                        }}
                                    >
                                        {groupEditing && viewingGroup ? (
                                            <button
                                                type="button"
                                                className="doc-tile-remove"
                                                title={`Remove ${doc.name || "document"} from group`}
                                                aria-label={`Remove ${doc.name || "document"} from group`}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    removeDocFromGroup(viewingGroup, doc);
                                                }}
                                            >
                                                <i className="fa-solid fa-xmark" aria-hidden="true"></i>
                                            </button>
                                        ) : null}
                                        <span className="doc-tile-icon">
                                            <i
                                                className={
                                                    openingId && sameId(openingId, doc.id)
                                                        ? "fa-solid fa-spinner fa-spin"
                                                        : docIconForName(doc.name)
                                                }
                                                aria-hidden="true"
                                            ></i>
                                        </span>
                                        <span className="doc-tile-name">{doc.name}</span>
                                        <span className="doc-tile-meta">
                                            {doc.missing ? "File unavailable" : formatDocMeta(doc)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="group-save-empty">This group has no documents.</p>
                        )}
                        {groupEditing && viewingGroup && canManageDocument(viewingGroup, actorName) ? (
                            <button
                                type="button"
                                className="secondary-btn"
                                style={{ ...SECONDARY_BTN, width: "100%" }}
                                onClick={() => beginAddToGroup(viewingGroup)}
                            >
                                <i className="fa-solid fa-plus" aria-hidden="true"></i>
                                Add docs
                            </button>
                        ) : null}
                    </div>
                </div>
            </ModuleModal>

            <ModuleModal
                open={confirmOpen}
                shown={confirmShown}
                className="modal--confirm"
                onBackdrop={() => { if (!confirmBusy) closeConfirm(); }}
            >
                <div className="modal-content modal-content--confirm">
                    <div className="modal-header">
                        <h3 style={{ margin: "0 auto", display: "flex", alignItems: "center", gap: 8 }}>
                            <i className="fa-solid fa-triangle-exclamation" style={{ color: "#f87171" }}></i>
                            {confirmConfig?.title || "Confirm"}
                        </h3>
                        <span
                            className="close-btn"
                            onClick={() => { if (!confirmBusy) closeConfirm(); }}
                        >
                            &times;
                        </span>
                    </div>
                    <div className="modal-body">
                        <p className="confirm-message">{confirmConfig?.message}</p>
                        <div className="confirm-actions">
                            <button
                                type="button"
                                className="secondary-btn"
                                style={SECONDARY_BTN}
                                disabled={confirmBusy}
                                onClick={() => closeConfirm()}
                            >
                                Cancel
                            </button>
                            <BusyButton
                                type="button"
                                className="confirm-danger-btn"
                                style={{
                                    ...ACCENT_BTN,
                                    background: "#ef4444",
                                    borderColor: "#ef4444",
                                    color: "#fff",
                                }}
                                busy={confirmBusy}
                                busyLabel="Removing…"
                                onClick={runConfirm}
                            >
                                {confirmConfig?.confirmLabel || "Confirm"}
                            </BusyButton>
                        </div>
                    </div>
                </div>
            </ModuleModal>

            <ModuleModal open={infoOpen} shown={infoShown} onBackdrop={() => closeModal(setInfoOpen, setInfoShown)}>
                <div className="modal-content">
                    <div className="modal-header">
                        <h3 style={{ margin: "0 auto", display: "flex", alignItems: "center", gap: 8 }}>
                            <i className="fa-solid fa-circle-info" style={{ color: ACCENT }}></i> Documents
                        </h3>
                        <span className="close-btn" onClick={() => closeModal(setInfoOpen, setInfoShown)}>&times;</span>
                    </div>
                    <div className="modal-body" style={{ fontSize: "0.93rem", lineHeight: 1.65, color: "#9ca3af" }}>
                        <div style={{ marginBottom: 20 }}>
                            <h4 style={{ color: ACCENT, margin: "0 0 8px 0", fontSize: "1rem", display: "flex", alignItems: "center", gap: 7 }}>
                                <i className="fa-solid fa-file-lines"></i> About this Module
                            </h4>
                            <p style={{ margin: 0 }}>A shared file library. Upload one document at a time, up to 25 MB, browse as tiles, and open files in a viewer tab.</p>
                        </div>
                        <div>
                            <h4 style={{ color: ACCENT, margin: "0 0 10px 0", fontSize: "1rem", display: "flex", alignItems: "center", gap: 7 }}>
                                <i className="fa-solid fa-list-check"></i> Key Actions
                            </h4>
                            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 9 }}>
                                <li style={{ display: "flex", alignItems: "flex-start", gap: 8 }}><i className="fa-solid fa-circle-check" style={{ color: ACCENT, marginTop: 3, flexShrink: 0 }}></i><span>Upload one file at a time (25 MB). Name it in Save as, and the icon is chosen from the file extension.</span></li>
                                <li style={{ display: "flex", alignItems: "flex-start", gap: 8 }}><i className="fa-solid fa-circle-check" style={{ color: ACCENT, marginTop: 3, flexShrink: 0 }}></i><span>Use + Group to select documents, then Save with a group name. Grouped files leave the main grid and open from the folder tile.</span></li>
                                <li style={{ display: "flex", alignItems: "flex-start", gap: 8 }}><i className="fa-solid fa-circle-check" style={{ color: ACCENT, marginTop: 3, flexShrink: 0 }}></i><span>Search by name, author, or extension.</span></li>
                                <li style={{ display: "flex", alignItems: "flex-start", gap: 8 }}><i className="fa-solid fa-circle-check" style={{ color: ACCENT, marginTop: 3, flexShrink: 0 }}></i><span>Click a tile to open the file in a viewer tab (PDF, Word, PowerPoint, and images).</span></li>
                                <li style={{ display: "flex", alignItems: "flex-start", gap: 8 }}><i className="fa-solid fa-circle-check" style={{ color: ACCENT, marginTop: 3, flexShrink: 0 }}></i><span>Rename or delete files and groups you created.</span></li>
                            </ul>
                        </div>
                    </div>
                </div>
            </ModuleModal>
        </div>
    );
}
