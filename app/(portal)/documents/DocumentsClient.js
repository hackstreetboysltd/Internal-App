'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPath } from "@/lib/apiPath";
import { get, getCollection, save, saveCollection, watch } from "@/lib/portalApi";
import { notifyTeam } from "@/lib/emailNotify";
import { useSession, clearActiveModule } from "@/lib/session";
import { portalNowIso } from "@/lib/portalTime";
import ItemMenu from "@/components/ItemMenu";
import {
    ITEMS_PER_PAGE,
    MAX_FILE_BYTES,
    canManageDocument,
    docIconForName,
    downloadDataUrl,
    filesCollectionName,
    flattenDocuments,
    fileExtension,
    formatFileBytes,
    formatDocMeta,
    matchesDocumentSearch,
    persistableCollection,
    applyDocumentRename,
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
    borderColor: ACCENT,
    color: "#042f2e",
    fontWeight: 700,
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

function ModuleModal({ open, shown, onBackdrop, children }) {
    if (!open) return null;
    return (
        <div
            className={shown ? "modal show" : "modal"}
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

function FileDrop({ inputRef, file, dragOver, setDragOver, onFile }) {
    const ext = file ? (fileExtension(file.name).toUpperCase() || "FILE") : "";
    return (
        <label
            className={`docs-drop${dragOver ? " dragover" : ""}${file ? " has-file" : ""}`}
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
                    <span className="docs-drop-hint">Click to replace</span>
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

    const [pickedFile, setPickedFile] = useState(null);
    const [saveAsName, setSaveAsName] = useState("");
    const [dropOver, setDropOver] = useState(false);
    const [saving, setSaving] = useState(false);
    const [renamingId, setRenamingId] = useState(null);
    const uploadFileRef = useRef(null);

    const timers = useRef([]);
    const later = (fn, ms) => {
        const id = setTimeout(fn, ms);
        timers.current.push(id);
        return id;
    };
    useEffect(() => () => timers.current.forEach(clearTimeout), []);

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

    const saveDocuments = async (list) => {
        try {
            await save("documents", list);
            await loadDocuments();
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
    const documents = useMemo(() => flattenDocuments(records), [records]);
    const filtered = useMemo(
        () => documents.filter((doc) => matchesDocumentSearch(doc, q)),
        [documents, q],
    );
    const totalCount = filtered.length;
    const maxPage = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE));
    const page = currentPage > maxPage ? maxPage : currentPage;
    const startIdx = (page - 1) * ITEMS_PER_PAGE;
    const paginated = filtered.slice(startIdx, startIdx + ITEMS_PER_PAGE);
    const actorName = (actor?.name || "").toLowerCase();

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
    };

    const uploadDocuments = async () => {
        if (!pickedFile) return alert("Choose a file to upload.");
        const displayName = sanitizeDocumentName(saveAsName) || pickedFile.name || "document";
        const current = actorRef.current || { name: "A Team Member", email: "" };
        setSaving(true);
        let saved = [];
        try {
            const list = persistableCollection(await get("documents"));
            const form = new FormData();
            form.append("files", pickedFile);
            form.append("filename", displayName);
            const res = await fetch(apiPath("/api/documents/files"), {
                method: "POST",
                credentials: "include",
                body: form,
            });
            let body = null;
            try { body = await res.json(); } catch { /* ignore */ }
            if (!res.ok) {
                throw new Error(body?.error || "Upload failed.");
            }
            saved = Array.isArray(body?.files) ? body.files : [];
            if (!saved.length) throw new Error("Upload failed.");
            const now = portalNowIso();
            const file = saved[0];
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
            notifyTeam({
                action: "added",
                actorName: current.name,
                itemName: displayName,
                module: "Documents",
                excludeEmail: current.email,
            });
            resetUploadForm();
            closeModal(setUploadOpen, setUploadShown);
        } catch (e) {
            console.error(e);
            for (const file of saved) {
                fetch(apiPath(`/api/documents/files/${file.id}`), {
                    method: "DELETE",
                    credentials: "include",
                }).catch(() => {});
            }
            alert(e.message || "Could not upload this file.");
        } finally {
            setSaving(false);
        }
    };

    const deleteDocument = async (doc) => {
        const current = actorRef.current || { name: "A Team Member", email: "" };
        if (!canManageDocument(doc, current.name)) {
            alert("Permission Denied: You can only delete documents you uploaded.");
            return;
        }
        if (!confirm(`Remove "${doc.name || "this document"}"?`)) return;
        const list = persistableCollection(await get("documents"));
        const owned = list.find((item) => sameId(item.id, doc.id));
        try {
            const blobRes = await fetch(apiPath(`/api/documents/files/${doc.id}`), {
                method: "DELETE",
                credentials: "include",
            });
            if (blobRes.status === 403) {
                alert("Permission Denied: You can only delete documents you uploaded.");
                return;
            }
            if (owned) {
                await saveCollection(filesCollectionName(doc.id), []);
                await saveDocuments(list.filter((item) => !sameId(item.id, doc.id)));
            } else {
                const parent = list.find((item) => sameId(item.id, doc.payloadId));
                if (!parent) return;
                parent.documents = (Array.isArray(parent.documents) ? parent.documents : [])
                    .filter((item) => !sameId(item.id, doc.id));
                const payloads = (await getCollection(filesCollectionName(parent.id)) || [])
                    .filter((p) => !sameId(p.id, doc.id));
                await saveCollection(filesCollectionName(parent.id), payloads);
                await saveDocuments(list);
            }
            notifyTeam({
                action: "deleted",
                actorName: current.name,
                itemName: doc.name || "a document",
                module: "Documents",
                excludeEmail: current.email,
            });
        } catch (e) {
            console.error(e);
            alert("Could not remove this document.");
        }
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

    const openDocument = async (doc) => {
        try {
            const res = await fetch(apiPath(`/api/documents/files/${doc.id}`), { credentials: "include" });
            if (res.ok) {
                const blob = await res.blob();
                const href = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = href;
                a.download = doc.name || "document";
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(href);
                return;
            }
            const payloads = await getCollection(filesCollectionName(doc.payloadId || doc.id));
            const list = Array.isArray(payloads) ? payloads : [];
            const payload = list.find((p) => sameId(p.id, doc.id)) || list[0];
            if (payload && payload.dataUrl) {
                downloadDataUrl(payload.dataUrl, payload.name || doc.name || "document");
                return;
            }
            alert("Could not open this document.");
        } catch (e) {
            console.error(e);
            alert("Could not open this document.");
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

                <div className="header-actions" style={{ marginBottom: 24 }}>
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
                            style={ACCENT_BTN}
                            onClick={() => {
                                resetUploadForm();
                                openModal(setUploadOpen, setUploadShown);
                            }}
                        >
                            Upload
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="docs-skeleton" aria-busy="true" aria-label="Loading documents">
                        <div className="skel-tile"></div><div className="skel-tile"></div><div className="skel-tile"></div>
                        <div className="skel-tile"></div><div className="skel-tile"></div><div className="skel-tile"></div>
                    </div>
                ) : (
                    <>
                        <div className="doc-grid">
                            {totalCount === 0 ? (
                                <div className="empty-state">
                                    <p>{q ? "No documents match your search query." : "No documents yet. Click \"Upload\" to add files."}</p>
                                </div>
                            ) : paginated.map((doc) => {
                                const isOwner = canManageDocument(doc, actorName);
                                const renaming = renamingId === doc.id;
                                return (
                                    <div
                                        key={doc.id}
                                        className={`doc-tile${renaming ? " is-menu-open" : ""}`}
                                        role={renaming ? undefined : "button"}
                                        tabIndex={renaming ? -1 : 0}
                                        onClick={() => {
                                            if (renaming) return;
                                            openDocument(doc);
                                        }}
                                        onKeyDown={(e) => {
                                            if (renaming) return;
                                            if (e.key === "Enter" || e.key === " ") {
                                                openDocument(doc);
                                            }
                                        }}
                                    >
                                        {isOwner ? (
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
                                            <i className={docIconForName(doc.name)} aria-hidden="true"></i>
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
                        />
                        {pickedFile ? (
                            <SaveAsInput
                                key={`${pickedFile.name}-${pickedFile.size}-${pickedFile.lastModified}`}
                                value={saveAsName}
                                onChange={setSaveAsName}
                                onSubmit={() => { if (!saving) uploadDocuments(); }}
                            />
                        ) : null}
                        <button type="button" onClick={uploadDocuments} disabled={saving || !pickedFile}>
                            {saving ? "Uploading..." : "Upload"}
                        </button>
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
                            <p style={{ margin: 0 }}>A shared file library. Upload one document at a time, up to 25 MB, and browse them as tiles, six to a page, with an icon for each file type.</p>
                        </div>
                        <div>
                            <h4 style={{ color: ACCENT, margin: "0 0 10px 0", fontSize: "1rem", display: "flex", alignItems: "center", gap: 7 }}>
                                <i className="fa-solid fa-list-check"></i> Key Actions
                            </h4>
                            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 9 }}>
                                <li style={{ display: "flex", alignItems: "flex-start", gap: 8 }}><i className="fa-solid fa-circle-check" style={{ color: ACCENT, marginTop: 3, flexShrink: 0 }}></i><span>Upload one file at a time (25 MB). Name it in Save as, and the icon is chosen from the file extension.</span></li>
                                <li style={{ display: "flex", alignItems: "flex-start", gap: 8 }}><i className="fa-solid fa-circle-check" style={{ color: ACCENT, marginTop: 3, flexShrink: 0 }}></i><span>Search by name, author, or extension.</span></li>
                                <li style={{ display: "flex", alignItems: "flex-start", gap: 8 }}><i className="fa-solid fa-circle-check" style={{ color: ACCENT, marginTop: 3, flexShrink: 0 }}></i><span>Click a tile to download the file.</span></li>
                                <li style={{ display: "flex", alignItems: "flex-start", gap: 8 }}><i className="fa-solid fa-circle-check" style={{ color: ACCENT, marginTop: 3, flexShrink: 0 }}></i><span>Rename or delete files you uploaded.</span></li>
                            </ul>
                        </div>
                    </div>
                </div>
            </ModuleModal>
        </div>
    );
}
