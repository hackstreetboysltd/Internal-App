'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { nextPortalId } from "@/lib/portalTime";
import { approve, get, reject, save, watch } from "@/lib/portalApi";
import { useSession, clearActiveModule } from "@/lib/session";
import ItemMenu from "@/components/ItemMenu";
import BusyButton from "@/components/BusyButton";
import { useBusy } from "@/lib/useBusy";

const ITEMS_PER_PAGE = 5;
const LEADERBOARD_ITEMS_PER_PAGE = 5;
const ACCENT = "#a78bfa";

function nextItemId() {
    return nextPortalId();
}

function stepsText(steps) {
    return Array.isArray(steps) ? steps.join("\n") : String(steps || "");
}

function parseSteps(steps) {
    return stepsText(steps).split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
}

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
    color: "white",
    fontWeight: 600,
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
        color: disabled ? "#4b5563" : "white",
        cursor: disabled ? "not-allowed" : "pointer",
        borderRadius: 4,
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

function SkelCard() {
    return (
        <div className="skel-compact-card">
            <div className="skel-compact-top">
                <span className="skel-line w65"></span>
                <div className="skel-btn-pair"><span className="skel-btn"></span><span className="skel-btn"></span></div>
            </div>
            <div className="skel-compact-meta"><span className="skel-line sm w40"></span><span className="skel-line sm w30"></span></div>
        </div>
    );
}

function StepsEditor({ steps, setSteps, inputId }) {
    const [draft, setDraft] = useState("");
    const [editing, setEditing] = useState(null);
    const [editText, setEditText] = useState("");
    const dragFrom = useRef(null);

    const addStep = () => {
        const text = draft.trim();
        if (!text) return;
        setSteps([...steps, text]);
        setDraft("");
    };

    const saveEdit = (idx) => {
        const next = steps.slice();
        next[idx] = editText.trim() || steps[idx];
        setSteps(next);
        setEditing(null);
        setEditText("");
    };

    return (
        <>
            <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                <input
                    type="text"
                    id={inputId}
                    placeholder="Add a new step..."
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            addStep();
                        }
                    }}
                    style={{ flex: 1, padding: "8px 12px", fontSize: "0.85rem", marginBottom: 0 }}
                />
                <button
                    type="button"
                    onClick={addStep}
                    style={{ width: "auto", background: "rgba(167, 139, 250, 0.1)", border: "1px solid rgba(167, 139, 250, 0.3)", color: ACCENT, padding: "8px 12px", borderRadius: 4, cursor: "pointer", fontSize: "0.85rem", marginBottom: 0, boxShadow: "none" }}
                >
                    <i className="fa-solid fa-plus"></i>
                </button>
            </div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, minHeight: 50, maxHeight: 200, overflowY: "auto" }}>
                {steps.map((text, idx) => (
                    <li
                        key={`${idx}-${text.slice(0, 12)}`}
                        className="step-item"
                        draggable
                        onDragStart={() => { dragFrom.current = idx; }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                            const from = dragFrom.current;
                            if (from == null || from === idx) return;
                            const next = steps.slice();
                            const [moved] = next.splice(from, 1);
                            next.splice(idx, 0, moved);
                            setSteps(next);
                            dragFrom.current = null;
                        }}
                    >
                        <i className="fa-solid fa-grip-vertical drag-handle"></i>
                        {editing === idx ? (
                            <input
                                type="text"
                                className="step-input"
                                value={editText}
                                autoFocus
                                onChange={(e) => setEditText(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        saveEdit(idx);
                                    }
                                }}
                            />
                        ) : (
                            <span className="step-content">{text}</span>
                        )}
                        <div className="step-actions">
                            {editing === idx ? (
                                <button type="button" className="step-btn" onClick={() => saveEdit(idx)}><i className="fa-solid fa-check"></i></button>
                            ) : (
                                <button type="button" className="step-btn" onClick={() => { setEditing(idx); setEditText(text); }}><i className="fa-solid fa-pen"></i></button>
                            )}
                            <button type="button" className="step-btn" onClick={() => setSteps(steps.filter((_, i) => i !== idx))}><i className="fa-solid fa-trash"></i></button>
                        </div>
                    </li>
                ))}
            </ul>
        </>
    );
}

export default function ProceduresClient() {
    const router = useRouter();
    const { actor, isAdminView } = useSession();
    const actorRef = useRef(actor);
    useEffect(() => { actorRef.current = actor; }, [actor]);

    const [loading, setLoading] = useState(true);
    const { busy: formBusy, runBusy: runFormBusy } = useBusy();
    const [procedures, setProcedures] = useState([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const [lbPage, setLbPage] = useState(1);
    const [refreshSpin, setRefreshSpin] = useState(false);

    const [shareOpen, setShareOpen] = useState(false);
    const [shareShown, setShareShown] = useState(false);
    const [lbOpen, setLbOpen] = useState(false);
    const [lbShown, setLbShown] = useState(false);
    const [detailOpen, setDetailOpen] = useState(false);
    const [detailShown, setDetailShown] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const [editShown, setEditShown] = useState(false);
    const [infoOpen, setInfoOpen] = useState(false);
    const [infoShown, setInfoShown] = useState(false);

    const [viewingId, setViewingId] = useState(null);
    const [checkedSteps, setCheckedSteps] = useState({});
    const [author, setAuthor] = useState("");
    const [title, setTitle] = useState("");
    const [shareSteps, setShareSteps] = useState([]);
    const [editId, setEditId] = useState("");
    const [editAuthor, setEditAuthor] = useState("");
    const [editTitle, setEditTitle] = useState("");
    const [editSteps, setEditSteps] = useState([]);

    const timers = useRef([]);
    const later = (fn, ms) => {
        const id = setTimeout(fn, ms);
        timers.current.push(id);
        return id;
    };
    useEffect(() => () => timers.current.forEach(clearTimeout), []);

    const loadProcedures = useCallback(async () => {
        setLoading(true);
        try {
            const list = await get("procedures");
            setProcedures(Array.isArray(list) ? list : []);
        } catch (e) {
            console.error("Error fetching procedures:", e);
            setProcedures([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const unsub = watch("procedures", (list) => {
            setProcedures(Array.isArray(list) ? list : []);
            setLoading(false);
        }, {
            onError: (e) => {
                console.error("Error fetching procedures:", e);
                setProcedures([]);
                setLoading(false);
            },
        });
        return unsub;
    }, []);

    const saveProcedures = async (list) => {
        try {
            await save("procedures", list);
        } catch (e) {
            console.error("Error saving procedures:", e);
            alert("Failed to save procedures runbook to database.");
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
    const filtered = useMemo(() => {
        const next = procedures.filter((p) =>
            (p.title || "").toLowerCase().includes(q)
            || stepsText(p.steps).toLowerCase().includes(q)
            || (p.author || "").toLowerCase().includes(q),
        );
        next.sort((a, b) => b.id - a.id);
        return next;
    }, [q, procedures]);

    const totalCount = filtered.length;
    const maxPage = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE));
    const page = currentPage > maxPage ? maxPage : currentPage;
    const startIdx = (page - 1) * ITEMS_PER_PAGE;
    const endIdx = startIdx + ITEMS_PER_PAGE;
    const pageItems = filtered.slice(startIdx, endIdx);

    const ranking = useMemo(() => {
        const counts = {};
        procedures.forEach((p) => { counts[p.author] = (counts[p.author] || 0) + 1; });
        return Object.entries(counts).sort((a, b) => b[1] - a[1]);
    }, [procedures]);
    const totalLbCount = ranking.length;
    const maxLbPage = Math.max(1, Math.ceil(totalLbCount / LEADERBOARD_ITEMS_PER_PAGE));
    const lb = lbPage > maxLbPage ? maxLbPage : lbPage;
    const lbStartIdx = (lb - 1) * LEADERBOARD_ITEMS_PER_PAGE;
    const lbEndIdx = lbStartIdx + LEADERBOARD_ITEMS_PER_PAGE;
    const paginatedLb = ranking.slice(lbStartIdx, lbEndIdx);

    const viewing = procedures.find((item) => item.id === viewingId);
    const viewingLines = viewing ? parseSteps(viewing.steps) : [];

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

    const addProcedure = () => runFormBusy(async () => {
        const name = author.trim();
        const guideTitle = title.trim();
        const steps = shareSteps.map((s) => s.trim()).filter(Boolean).join("\n");
        if (!name || !guideTitle || !steps) return alert("Your name, runbook title, and execution guide details are required");

        const list = await get("procedures");
        const next = Array.isArray(list) ? list.slice() : [];
        next.push({ id: nextItemId(), author: name, title: guideTitle, steps });
        await saveProcedures(next);

        const current = actorRef.current || { name: "A Team Member", email: "" };

        setAuthor("");
        setTitle("");
        setShareSteps([]);
        closeModal(setShareOpen, setShareShown);
    });

    const deleteProcedure = async (id) => {
        const current = actorRef.current || { name: "A Team Member", email: "" };
        const list = await get("procedures");
        const deletedItem = (Array.isArray(list) ? list : []).find((p) => p.id === id);
        if (deletedItem && (deletedItem.author || "").toLowerCase() !== current.name.toLowerCase()) {
            alert("Permission Denied: You can only delete your own procedures.");
            return;
        }
        if (!confirm("Are you sure you want to remove this procedure runbook?")) return;
        const next = (Array.isArray(list) ? list : []).filter((p) => p.id !== id);
        if (viewingId === id) closeModal(setDetailOpen, setDetailShown, () => setViewingId(null));
        await saveProcedures(next);
    };

    const openEdit = async (procId) => {
        const current = actorRef.current || { name: "A Team Member", email: "" };
        const list = await get("procedures");
        const item = (Array.isArray(list) ? list : []).find((p) => p.id === procId);
        if (!item) return;
        if ((item.author || "").toLowerCase() !== current.name.toLowerCase()) {
            alert("Permission Denied: You can only edit your own procedures.");
            return;
        }
        setEditId(String(item.id));
        setEditAuthor(item.author || "");
        setEditTitle(item.title || "");
        setEditSteps(parseSteps(item.steps));
        openModal(setEditOpen, setEditShown);
    };

    const saveEditProcedure = () => runFormBusy(async () => {
        const id = parseInt(editId, 10);
        const name = editAuthor.trim();
        const guideTitle = editTitle.trim();
        const steps = editSteps.map((s) => s.trim()).filter(Boolean).join("\n");
        if (!name || !guideTitle || !steps) return alert("Your name, runbook title, and execution guide details are required");

        const current = actorRef.current || { name: "A Team Member", email: "" };
        const list = await get("procedures");
        const next = Array.isArray(list) ? list.slice() : [];
        const item = next.find((p) => p.id === id);
        if (item) {
            if ((item.author || "").toLowerCase() !== current.name.toLowerCase()) {
                alert("Permission Denied: You can only edit your own procedures.");
                return;
            }
            item.author = name;
            item.title = guideTitle;
            item.steps = steps;
            await saveProcedures(next);
        }
        closeModal(setEditOpen, setEditShown);
    });

    const approvePending = async (id) => {
        if (!confirm("Approve this procedure?")) return;
        try {
            await approve("procedures", id);
            await loadProcedures();
        } catch (e) {
            console.error(e);
            alert("Failed to approve procedure.");
        }
    };

    const rejectPending = async (id) => {
        if (!confirm("Reject and discard this procedure?")) return;
        try {
            await reject("procedures", id);
            await loadProcedures();
        } catch (e) {
            console.error(e);
            alert("Failed to reject procedure.");
        }
    };

    const refreshProcedures = async () => {
        setRefreshSpin(true);
        try {
            await loadProcedures();
        } catch (e) {
            console.error("Error during manual procedures refresh:", e);
        } finally {
            later(() => setRefreshSpin(false), 500);
        }
    };

    const actorName = (actor?.name || "").toLowerCase();

    return (
        <div className="procedures-module">
            <div className="container">
                <div
                    className="header-container"
                    style={{ display: "grid", gridTemplateColumns: "40px 1fr auto", alignItems: "center", marginBottom: 24, borderBottom: "1px solid var(--border-color)", paddingBottom: 16 }}
                >
                    <div></div>
                    <h2 style={{ margin: "0 auto", borderBottom: "none", paddingBottom: 0, fontSize: "1.8rem", display: "flex", alignItems: "center", gap: 10 }}>
                        Procedures
                        <IconBtn title="About this module" onClick={() => openModal(setInfoOpen, setInfoShown)} style={{ width: "auto", height: "auto", fontSize: "1rem" }} hoverScale={1.15}>
                            <i className="fa-solid fa-circle-info"></i>
                        </IconBtn>
                    </h2>
                    <div className="header-actions-right" style={{ display: "flex", alignItems: "center", gap: 4, justifySelf: "end" }}>
                        {!isAdminView ? (
                            <IconBtn className="refresh-btn" title="Refresh procedures data" onClick={refreshProcedures}>
                                <i className={`fa-solid fa-arrows-rotate${refreshSpin ? " fa-spin" : ""}`}></i>
                            </IconBtn>
                        ) : null}
                        <IconBtn className="close-module-btn" title="Close module" onClick={closeModule}>
                            <i className="fa-solid fa-xmark"></i>
                        </IconBtn>
                    </div>
                </div>

                <div className="header-actions" style={{ marginBottom: 24, display: "flex", gap: 16, alignItems: "center" }}>
                    <div className="search-input-wrapper" style={{ flex: 1 }}>
                        <input
                            type="text"
                            id="searchProcedures"
                            placeholder="Search keyword..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <div className="header-actions-tools">
                        <button type="button" className="header-actions-icon-btn" onClick={() => openModal(setLbOpen, setLbShown)} style={ACCENT_BTN} title="View Contributors">
                            <i className="fa-solid fa-trophy"></i>
                        </button>
                    </div>
                    <div className="header-actions-primary">
                        <button type="button" onClick={() => { setShareSteps([]); openModal(setShareOpen, setShareShown); }} style={ACCENT_BTN}>
                            Publish Guide
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div id="proceduresLoader" className="module-skeleton-grid" aria-busy="true" aria-label="Loading procedures">
                        <SkelCard /><SkelCard /><SkelCard /><SkelCard /><SkelCard /><SkelCard />
                    </div>
                ) : (
                    <div id="proceduresContent">
                        <div>
                            <h3 style={{ marginBottom: 16 }}> All Procedures</h3>
                            <div id="proceduresList" className="list-container" style={{ marginBottom: 12 }}>
                                {totalCount === 0 ? (
                                    <div className="empty-state" style={{ gridColumn: "1 / -1" }}>
                                        <p>{q ? "No procedures match your search query." : "No procedures published yet."}</p>
                                    </div>
                                ) : (
                                    pageItems.map((p) => {
                                        const isOwner = (p.author || "").toLowerCase() === actorName;
                                        const nSteps = parseSteps(p.steps).length;
                                        return (
                                            <div
                                                key={p.pendingId || p.id}
                                                className="card accordion-card"
                                                style={{ cursor: "pointer", border: "1px solid rgba(255, 255, 255, 0.05)", transition: "all 0.2s ease" }}
                                                onClick={() => {
                                                    setViewingId(p.id);
                                                    setCheckedSteps({});
                                                    openModal(setDetailOpen, setDetailShown);
                                                }}
                                            >
                                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, padding: 2 }}>
                                                    <strong style={{ fontSize: "0.85rem", color: "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: isAdminView ? "60%" : "70%", display: "flex", alignItems: "center", gap: 6 }}>
                                                        {p.title}
                                                        {isAdminView && p.pendingType ? (
                                                            <span className="badge" style={{ fontSize: "0.7rem", padding: "2px 6px", marginLeft: 6, background: p.pendingType === "create" ? "rgba(16,185,129,0.15)" : "rgba(99,102,241,0.15)", color: p.pendingType === "create" ? "#10b981" : "#6366f1", border: `1px solid ${p.pendingType === "create" ? "rgba(16,185,129,0.3)" : "rgba(99,102,241,0.3)"}` }}>
                                                                {p.pendingType.toUpperCase()}
                                                            </span>
                                                        ) : null}
                                                    </strong>
                                                    {isAdminView && p.pendingId ? (
                                                        <div style={{ display: "flex", alignItems: "center", gap: 4 }} onClick={(e) => e.stopPropagation()}>
                                                            <button type="button" className="secondary-btn" style={{ padding: "4px 8px", fontSize: "0.7rem", width: "auto", borderRadius: 4, background: "rgba(16, 185, 129, 0.15)", color: "#10b981", border: "1px solid rgba(16, 185, 129, 0.2)", marginBottom: 0 }} onClick={() => approvePending(p.pendingId)}>Approve</button>
                                                            <button type="button" className="secondary-btn" style={{ padding: "4px 8px", fontSize: "0.7rem", width: "auto", borderRadius: 4, background: "rgba(239, 68, 68, 0.15)", color: "#ef4444", border: "1px solid rgba(239, 68, 68, 0.2)", marginBottom: 0 }} onClick={() => rejectPending(p.pendingId)}>Reject</button>
                                                        </div>
                                                    ) : !isAdminView && isOwner ? (
                                                        <div style={{ display: "flex", alignItems: "center", gap: 4 }} onClick={(e) => e.stopPropagation()}>
                                                            <ItemMenu
                                                                items={[
                                                                    { label: "Edit", onClick: () => openEdit(p.id) },
                                                                    { label: "Delete", onClick: () => deleteProcedure(p.id), danger: true },
                                                                ]}
                                                            />
                                                        </div>
                                                    ) : null}
                                                </div>
                                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 2, marginTop: 4, fontSize: "0.75rem" }}>
                                                    <span style={{ color: "#9ca3af" }}> {p.author || "Anonymous"}</span>
                                                    <span style={{ color: ACCENT, fontWeight: 600 }}> {nSteps} steps</span>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                            {totalCount > 0 ? (
                                <div id="mainPagination" style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12, marginTop: 16, fontSize: "0.85rem", color: "#9ca3af", fontWeight: 500 }}>
                                    <Pager start={startIdx + 1} end={Math.min(endIdx, totalCount)} total={totalCount} page={page} onPage={(d) => setCurrentPage(page + d)} />
                                </div>
                            ) : null}
                        </div>
                    </div>
                )}
            </div>

            <ModuleModal open={lbOpen} shown={lbShown} onBackdrop={() => closeModal(setLbOpen, setLbShown)}>
                <div className="modal-content">
                    <div className="modal-header">
                        <h3 style={{ margin: "0 auto", color: ACCENT }}> Top Contributors</h3>
                        <span className="close-btn" onClick={() => closeModal(setLbOpen, setLbShown)}>&times;</span>
                    </div>
                    <div className="modal-body">
                        <div id="proceduresLeaderboard" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {totalLbCount === 0 ? (
                                <p style={{ fontSize: "0.85rem", color: "#6b7280", fontStyle: "italic", margin: 0, textAlign: "center", width: "100%" }}>No contributor publications logged yet.</p>
                            ) : (
                                paginatedLb.map(([user, val], relativeIdx) => {
                                    const absoluteIdx = lbStartIdx + relativeIdx;
                                    return (
                                        <div key={user} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "rgba(0,0,0,0.15)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.03)" }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                {absoluteIdx > 2 ? (
                                                    <span style={{ color: "#6b7280", fontWeight: "bold", fontSize: "0.85rem", width: 16, textAlign: "center", display: "inline-block" }}>{absoluteIdx + 1}</span>
                                                ) : null}
                                                <strong style={{ color: "white", fontSize: "0.9rem" }}>{user}</strong>
                                            </div>
                                            <div style={{ fontSize: "0.8rem", color: "#9ca3af", fontWeight: 600 }}>
                                                {val} runbook{val > 1 ? "s" : ""}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                        {totalLbCount > 0 ? (
                            <div id="leaderboardPagination" style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12, marginTop: 20, fontSize: "0.85rem", color: "#9ca3af", fontWeight: 500 }}>
                                <Pager start={lbStartIdx + 1} end={Math.min(lbEndIdx, totalLbCount)} total={totalLbCount} page={lb} onPage={(d) => setLbPage(lb + d)} />
                            </div>
                        ) : null}
                    </div>
                </div>
            </ModuleModal>

            <ModuleModal open={detailOpen} shown={detailShown} onBackdrop={() => closeModal(setDetailOpen, setDetailShown, () => setViewingId(null))}>
                <div className="modal-content">
                    <div className="modal-header">
                        <h3 style={{ margin: "0 auto", color: ACCENT }}> {viewing?.title || "Runbook Detail"}</h3>
                        <span className="close-btn" onClick={() => closeModal(setDetailOpen, setDetailShown, () => setViewingId(null))}>&times;</span>
                    </div>
                    <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                        <div style={{ fontSize: "0.85rem", color: "#9ca3af", display: "flex", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: 8 }}>
                            {viewing ? (
                                <>
                                    <span> Contributor: <strong>{viewing.author || "Anonymous"}</strong></span>
                                    <span style={{ color: ACCENT, fontWeight: 600 }}> {viewingLines.length} steps</span>
                                </>
                            ) : null}
                        </div>
                        <div>
                            {viewingLines.map((line, idx) => {
                                const uniqueId = `check-${viewing?.id}-${idx}`;
                                const checked = !!checkedSteps[idx];
                                return (
                                    <label
                                        key={uniqueId}
                                        htmlFor={uniqueId}
                                        className="step-label"
                                        style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: 6, borderRadius: 6, cursor: "pointer", transition: "all 0.15s" }}
                                    >
                                        <input
                                            type="checkbox"
                                            id={uniqueId}
                                            checked={checked}
                                            onChange={() => setCheckedSteps((prev) => ({ ...prev, [idx]: !prev[idx] }))}
                                            style={{ width: 16, height: 16, margin: "2px 0 0 0", cursor: "pointer", flexShrink: 0 }}
                                        />
                                        <span style={{ fontSize: "0.88rem", color: checked ? "#6b7280" : "#d1d5db", lineHeight: 1.4, textDecoration: checked ? "line-through" : "none" }}>{line}</span>
                                    </label>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </ModuleModal>

            <ModuleModal open={editOpen} shown={editShown} onBackdrop={() => closeModal(setEditOpen, setEditShown)}>
                <div className="modal-content">
                    <div className="modal-header">
                        <h3 style={{ margin: "0 auto", color: ACCENT }}><i className="fa-solid fa-pen"></i> Edit Guide Runbook</h3>
                        <span className="close-btn" onClick={() => closeModal(setEditOpen, setEditShown)}>&times;</span>
                    </div>
                    <div className="modal-body">
                        <label htmlFor="editProcAuthor" style={{ fontSize: "0.85rem", color: "#9ca3af", display: "block", marginBottom: 6 }}>Your Name</label>
                        <input type="text" id="editProcAuthor" placeholder="e.g. Alice" required value={editAuthor} onChange={(e) => setEditAuthor(e.target.value)} style={{ padding: "8px 12px", fontSize: "0.85rem" }} />

                        <label htmlFor="editProcTitle" style={{ fontSize: "0.85rem", color: "#9ca3af", display: "block", marginBottom: 6, marginTop: 14 }}>Guide Title</label>
                        <input type="text" id="editProcTitle" placeholder="e.g. Setting up a new staging workspace" required value={editTitle} onChange={(e) => setEditTitle(e.target.value)} style={{ padding: "8px 12px", fontSize: "0.85rem" }} />

                        <label style={{ fontSize: "0.85rem", color: "#9ca3af", display: "block", marginBottom: 6, marginTop: 14 }}>Execution Steps</label>
                        <StepsEditor steps={editSteps} setSteps={setEditSteps} inputId="editProcStepInput" />

                        <BusyButton type="button" busy={formBusy} busyLabel="Saving…" onClick={saveEditProcedure} style={{ marginTop: 20, background: ACCENT, borderColor: ACCENT, color: "white", fontWeight: 600, width: "100%" }}>
                            Save Changes
                        </BusyButton>
                    </div>
                </div>
            </ModuleModal>

            <ModuleModal open={shareOpen} shown={shareShown} onBackdrop={() => closeModal(setShareOpen, setShareShown)}>
                <div className="modal-content">
                    <div className="modal-header">
                        <h3 style={{ margin: "0 auto", color: ACCENT }}> Publish Procedure</h3>
                        <span className="close-btn" onClick={() => closeModal(setShareOpen, setShareShown)}>&times;</span>
                    </div>
                    <div className="modal-body">
                        <label htmlFor="procAuthor" style={{ fontSize: "0.85rem", color: "#9ca3af", display: "block", marginBottom: 6 }}>Your Name</label>
                        <input type="text" id="procAuthor" placeholder="e.g. Alice" required value={author} onChange={(e) => setAuthor(e.target.value)} style={{ padding: "8px 12px", fontSize: "0.85rem" }} />

                        <label htmlFor="procTitle" style={{ fontSize: "0.85rem", color: "#9ca3af", display: "block", marginBottom: 6, marginTop: 14 }}>Guide Title</label>
                        <input type="text" id="procTitle" placeholder="e.g. Setting up a new staging workspace" required value={title} onChange={(e) => setTitle(e.target.value)} style={{ padding: "8px 12px", fontSize: "0.85rem" }} />

                        <label style={{ fontSize: "0.85rem", color: "#9ca3af", display: "block", marginBottom: 6, marginTop: 14 }}>Execution Steps</label>
                        <StepsEditor steps={shareSteps} setSteps={setShareSteps} inputId="newProcStepInput" />

                        <BusyButton type="button" busy={formBusy} busyLabel="Publishing…" onClick={addProcedure} style={{ marginTop: 20, background: ACCENT, borderColor: ACCENT, color: "white", fontWeight: 600, width: "100%" }}>
                            Publish Procedure
                        </BusyButton>
                    </div>
                </div>
            </ModuleModal>

            <ModuleModal open={infoOpen} shown={infoShown} onBackdrop={() => closeModal(setInfoOpen, setInfoShown)}>
                <div className="modal-content">
                    <div className="modal-header">
                        <h3 style={{ margin: "0 auto", display: "flex", alignItems: "center", gap: 8 }}>
                            <i className="fa-solid fa-circle-info" style={{ color: ACCENT }}></i> Procedural Guides
                        </h3>
                        <span className="close-btn" onClick={() => closeModal(setInfoOpen, setInfoShown)}>&times;</span>
                    </div>
                    <div className="modal-body" style={{ fontSize: "0.93rem", lineHeight: 1.65, color: "#9ca3af" }}>
                        <div style={{ marginBottom: 20 }}>
                            <h4 style={{ color: ACCENT, margin: "0 0 8px 0", fontSize: "1rem", display: "flex", alignItems: "center", gap: 7 }}>
                                <i className="fa-solid fa-list-check"></i> About this Module
                            </h4>
                            <p style={{ margin: 0 }}>A standard operating procedures (SOP) documentation bank defining step-by-step operational workflows and technical checklists for the team.</p>
                        </div>
                        <div>
                            <h4 style={{ color: ACCENT, margin: "0 0 10px 0", fontSize: "1rem", display: "flex", alignItems: "center", gap: 7 }}>
                                <i className="fa-solid fa-list-check"></i> Key Actions
                            </h4>
                            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 9 }}>
                                <li style={{ display: "flex", alignItems: "flex-start", gap: 8 }}><i className="fa-solid fa-circle-check" style={{ color: ACCENT, marginTop: 3, flexShrink: 0 }}></i><span>Publish a new procedure with an ordered, drag-sortable step list.</span></li>
                                <li style={{ display: "flex", alignItems: "flex-start", gap: 8 }}><i className="fa-solid fa-circle-check" style={{ color: ACCENT, marginTop: 3, flexShrink: 0 }}></i><span>Browse and search procedures by title or step content.</span></li>
                                <li style={{ display: "flex", alignItems: "flex-start", gap: 8 }}><i className="fa-solid fa-circle-check" style={{ color: ACCENT, marginTop: 3, flexShrink: 0 }}></i><span>Click a procedure card to open the full runbook detail view.</span></li>
                                <li style={{ display: "flex", alignItems: "flex-start", gap: 8 }}><i className="fa-solid fa-circle-check" style={{ color: ACCENT, marginTop: 3, flexShrink: 0 }}></i><span>View the Top Contributors leaderboard; edit or delete entries.</span></li>
                            </ul>
                        </div>
                    </div>
                </div>
            </ModuleModal>
        </div>
    );
}
