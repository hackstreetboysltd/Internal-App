'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { approve, get, reject, save } from "@/lib/portalApi";
import { notifyTeam } from "@/lib/emailNotify";
import { useSession, clearActiveModule } from "@/lib/session";

const ITEMS_PER_PAGE = 5;
const LEADERBOARD_ITEMS_PER_PAGE = 5;

function nextItemId() {
    return Date.now();
}

const ICON_BTN = {
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "#fbbf24",
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
    background: "#fbbf24",
    borderColor: "#fbbf24",
    color: "#1e1b4b",
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
        background: disabled ? "rgba(255,255,255,0.05)" : "#fbbf24",
        border: "none",
        color: disabled ? "#4b5563" : "#1e1b4b",
        cursor: disabled ? "not-allowed" : "pointer",
        borderRadius: 4,
        fontWeight: "bold",
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
            <div className="skel-compact-meta"><span className="skel-line sm w40"></span></div>
        </div>
    );
}

export default function SkillsClient() {
    const router = useRouter();
    const { actor, isAdminView } = useSession();
    const actorRef = useRef(actor);
    useEffect(() => { actorRef.current = actor; }, [actor]);

    const [loading, setLoading] = useState(true);
    const [skills, setSkills] = useState([]);
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

    const [viewingSkillId, setViewingSkillId] = useState(null);
    const [contribName, setContribName] = useState("");
    const [skillTitle, setSkillTitle] = useState("");
    const [skillDesc, setSkillDesc] = useState("");
    const [editId, setEditId] = useState("");
    const [editAuthor, setEditAuthor] = useState("");
    const [editTitle, setEditTitle] = useState("");
    const [editDesc, setEditDesc] = useState("");

    const timers = useRef([]);
    const later = (fn, ms) => {
        const id = setTimeout(fn, ms);
        timers.current.push(id);
        return id;
    };
    useEffect(() => () => timers.current.forEach(clearTimeout), []);

    const loadSkills = useCallback(async () => {
        setLoading(true);
        try {
            const list = await get("skills");
            setSkills(Array.isArray(list) ? list : []);
        } catch (e) {
            console.error("Error fetching skills:", e);
            setSkills([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const t = setTimeout(() => { loadSkills(); }, 0);
        return () => clearTimeout(t);
    }, [loadSkills]);

    const saveSkills = async (list) => {
        try {
            await save("skills", list);
            await loadSkills();
        } catch (e) {
            console.error("Error saving skills:", e);
            alert("Failed to save skill entry to database.");
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
    const filteredSkills = useMemo(() => {
        const filtered = skills.filter((s) =>
            (s.title || "").toLowerCase().includes(q)
            || (s.body || "").toLowerCase().includes(q)
            || (s.author || "").toLowerCase().includes(q),
        );
        filtered.sort((a, b) => b.id - a.id);
        return filtered;
    }, [q, skills]);

    const totalCount = filteredSkills.length;
    const maxPage = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE));
    const page = currentPage > maxPage ? maxPage : currentPage;
    const startIdx = (page - 1) * ITEMS_PER_PAGE;
    const endIdx = startIdx + ITEMS_PER_PAGE;
    const paginatedSkills = filteredSkills.slice(startIdx, endIdx);

    const ranking = useMemo(() => {
        const counts = {};
        skills.forEach((s) => { counts[s.author] = (counts[s.author] || 0) + 1; });
        return Object.entries(counts).sort((a, b) => b[1] - a[1]);
    }, [skills]);
    const totalLbCount = ranking.length;
    const maxLbPage = Math.max(1, Math.ceil(totalLbCount / LEADERBOARD_ITEMS_PER_PAGE));
    const lb = lbPage > maxLbPage ? maxLbPage : lbPage;
    const lbStartIdx = (lb - 1) * LEADERBOARD_ITEMS_PER_PAGE;
    const lbEndIdx = lbStartIdx + LEADERBOARD_ITEMS_PER_PAGE;
    const paginatedLb = ranking.slice(lbStartIdx, lbEndIdx);

    const viewing = skills.find((item) => item.id === viewingSkillId);

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

    const addSkill = async () => {
        const author = contribName.trim();
        const title = skillTitle.trim();
        const body = skillDesc.trim();
        if (!author || !title || !body) return alert("Fill in all sections of the form");

        const list = await get("skills");
        const next = Array.isArray(list) ? list.slice() : [];
        next.push({ id: nextItemId(), author, title, body });
        await saveSkills(next);

        const current = actorRef.current || { name: "A Team Member", email: "" };
        notifyTeam({
            action: "added",
            actorName: current.name,
            itemName: title,
            module: "Skills",
            excludeEmail: current.email,
        });

        setContribName("");
        setSkillTitle("");
        setSkillDesc("");
        closeModal(setShareOpen, setShareShown);
    };

    const deleteSkill = async (id) => {
        const current = actorRef.current || { name: "A Team Member", email: "" };
        const list = await get("skills");
        const deletedItem = (Array.isArray(list) ? list : []).find((s) => s.id === id);
        if (deletedItem && (deletedItem.author || "").toLowerCase() !== current.name.toLowerCase()) {
            alert("Permission Denied: You can only delete your own skills.");
            return;
        }
        if (!confirm("Are you sure you want to delete this skill article?")) return;
        const filtered = (Array.isArray(list) ? list : []).filter((s) => s.id !== id);
        if (viewingSkillId === id) closeModal(setDetailOpen, setDetailShown, () => setViewingSkillId(null));
        await saveSkills(filtered);
        notifyTeam({
            action: "deleted",
            actorName: current.name,
            itemName: deletedItem ? deletedItem.title : "a skill",
            module: "Skills",
            excludeEmail: current.email,
        });
    };

    const openEdit = async (skillId) => {
        const current = actorRef.current || { name: "A Team Member", email: "" };
        const list = await get("skills");
        const item = (Array.isArray(list) ? list : []).find((s) => s.id === skillId);
        if (!item) return;
        if ((item.author || "").toLowerCase() !== current.name.toLowerCase()) {
            alert("Permission Denied: You can only edit your own skills.");
            return;
        }
        setEditId(String(item.id));
        setEditAuthor(item.author || "");
        setEditTitle(item.title || "");
        setEditDesc(item.body || "");
        openModal(setEditOpen, setEditShown);
    };

    const saveEditSkill = async () => {
        const id = parseInt(editId, 10);
        const author = editAuthor.trim();
        const title = editTitle.trim();
        const body = editDesc.trim();
        if (!author || !title || !body) return alert("Your name, skill title, and guidance details are required");

        const current = actorRef.current || { name: "A Team Member", email: "" };
        const list = await get("skills");
        const next = Array.isArray(list) ? list.slice() : [];
        const item = next.find((s) => s.id === id);
        if (item) {
            if ((item.author || "").toLowerCase() !== current.name.toLowerCase()) {
                alert("Permission Denied: You can only edit your own skills.");
                return;
            }
            item.author = author;
            item.title = title;
            item.body = body;
            await saveSkills(next);
            notifyTeam({
                action: "edited",
                actorName: current.name,
                itemName: title,
                module: "Skills",
                excludeEmail: current.email,
            });
        }
        closeModal(setEditOpen, setEditShown);
    };

    const approvePending = async (id) => {
        if (!confirm("Approve this skill publication?")) return;
        try {
            await approve("skills", id);
            await loadSkills();
        } catch (e) {
            console.error(e);
            alert("Failed to approve skill.");
        }
    };

    const rejectPending = async (id) => {
        if (!confirm("Reject and delete this skill publication?")) return;
        try {
            await reject("skills", id);
            await loadSkills();
        } catch (e) {
            console.error(e);
            alert("Failed to reject skill.");
        }
    };

    const refreshSkills = async () => {
        setRefreshSpin(true);
        try {
            await loadSkills();
        } catch (e) {
            console.error("Error during manual skills refresh:", e);
        } finally {
            later(() => setRefreshSpin(false), 500);
        }
    };

    const actorName = (actor?.name || "").toLowerCase();

    return (
        <div className="skills-module">
            <div className="container">
                <div
                    className="header-container"
                    style={{ display: "grid", gridTemplateColumns: "40px 1fr auto", alignItems: "center", marginBottom: 24, borderBottom: "1px solid var(--border-color)", paddingBottom: 16 }}
                >
                    <div></div>
                    <h2 style={{ margin: "0 auto", borderBottom: "none", paddingBottom: 0, fontSize: "1.8rem", display: "flex", alignItems: "center", gap: 10 }}>
                        Skills
                        <IconBtn title="About this module" onClick={() => openModal(setInfoOpen, setInfoShown)} style={{ width: "auto", height: "auto", fontSize: "1rem" }} hoverScale={1.15}>
                            <i className="fa-solid fa-circle-info"></i>
                        </IconBtn>
                    </h2>
                    <div className="header-actions-right" style={{ display: "flex", alignItems: "center", gap: 4, justifySelf: "end" }}>
                        {!isAdminView ? (
                            <IconBtn className="refresh-btn" title="Refresh skills data" onClick={refreshSkills}>
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
                            id="searchSkills"
                            placeholder="Enter keyword..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <button type="button" onClick={() => openModal(setLbOpen, setLbShown)} style={ACCENT_BTN} title="View Contributors">
                        <i className="fa-solid fa-trophy"></i>
                    </button>
                    <button type="button" onClick={() => openModal(setShareOpen, setShareShown)} style={ACCENT_BTN}>
                        Share Skill
                    </button>
                </div>

                {loading ? (
                    <div id="skillsLoader" className="module-skeleton-grid" aria-busy="true" aria-label="Loading skills">
                        <SkelCard /><SkelCard /><SkelCard /><SkelCard /><SkelCard /><SkelCard />
                    </div>
                ) : (
                    <div id="skillsContent">
                        <div>
                            <h3 style={{ marginBottom: 16 }}> All Skills</h3>
                            <div id="skillsContainer" className="list-container" style={{ marginBottom: 12 }}>
                                {totalCount === 0 ? (
                                    <div className="empty-state" style={{ gridColumn: "1 / -1" }}>
                                        <p>{q ? "No skills match your search query." : "No skills logged yet. Click \"Share Skill\" to get started."}</p>
                                    </div>
                                ) : (
                                    paginatedSkills.map((s) => {
                                        const isOwner = (s.author || "").toLowerCase() === actorName;
                                        return (
                                            <div
                                                key={s.pendingId || s.id}
                                                className="card accordion-card"
                                                style={{ cursor: "pointer", border: "1px solid rgba(255, 255, 255, 0.05)", transition: "all 0.2s ease" }}
                                                onClick={() => {
                                                    setViewingSkillId(s.id);
                                                    openModal(setDetailOpen, setDetailShown);
                                                }}
                                            >
                                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, padding: 2 }}>
                                                    <strong style={{ fontSize: "0.85rem", color: "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: isAdminView ? "60%" : "70%", display: "flex", alignItems: "center", gap: 6 }}>
                                                        {s.title}
                                                        {isAdminView && s.pendingType ? (
                                                            <span className="badge" style={{ fontSize: "0.7rem", padding: "2px 6px", marginLeft: 6, background: s.pendingType === "create" ? "rgba(16,185,129,0.15)" : "rgba(99,102,241,0.15)", color: s.pendingType === "create" ? "#10b981" : "#6366f1", border: `1px solid ${s.pendingType === "create" ? "rgba(16,185,129,0.3)" : "rgba(99,102,241,0.3)"}` }}>
                                                                {s.pendingType.toUpperCase()}
                                                            </span>
                                                        ) : null}
                                                    </strong>
                                                    {isAdminView && s.pendingId ? (
                                                        <div style={{ display: "flex", alignItems: "center", gap: 4 }} onClick={(e) => e.stopPropagation()}>
                                                            <button type="button" className="secondary-btn" style={{ padding: "4px 8px", fontSize: "0.7rem", width: "auto", borderRadius: 4, background: "rgba(16, 185, 129, 0.15)", color: "#10b981", border: "1px solid rgba(16, 185, 129, 0.2)", marginBottom: 0 }} onClick={() => approvePending(s.pendingId)}>Approve</button>
                                                            <button type="button" className="secondary-btn" style={{ padding: "4px 8px", fontSize: "0.7rem", width: "auto", borderRadius: 4, background: "rgba(239, 68, 68, 0.15)", color: "#ef4444", border: "1px solid rgba(239, 68, 68, 0.2)", marginBottom: 0 }} onClick={() => rejectPending(s.pendingId)}>Reject</button>
                                                        </div>
                                                    ) : !isAdminView && isOwner ? (
                                                        <div style={{ display: "flex", alignItems: "center", gap: 4 }} onClick={(e) => e.stopPropagation()}>
                                                            <button type="button" className="secondary-btn" style={{ padding: "2px 6px", fontSize: "0.7rem", width: "auto", borderRadius: 4, background: "rgba(251, 191, 36, 0.1)", color: "#fbbf24", marginBottom: 0, border: "1px solid rgba(251, 191, 36, 0.15)" }} onClick={() => openEdit(s.id)}>
                                                                <i className="fa-solid fa-pen"></i>
                                                            </button>
                                                            <button type="button" className="secondary-btn" style={{ padding: "2px 6px", fontSize: "0.7rem", width: "auto", borderRadius: 4, background: "rgba(239,68,68,0.1)", color: "#ef4444", marginBottom: 0 }} onClick={() => deleteSkill(s.id)}>
                                                                <i className="fa-solid fa-trash"></i>
                                                            </button>
                                                        </div>
                                                    ) : null}
                                                </div>
                                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 2, marginTop: 4, fontSize: "0.75rem" }}>
                                                    <span style={{ color: "#9ca3af" }}>{s.author}</span>
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
                        <h3 style={{ margin: "0 auto", color: "#fbbf24" }}> Top Contributors</h3>
                        <span className="close-btn" onClick={() => closeModal(setLbOpen, setLbShown)}>&times;</span>
                    </div>
                    <div className="modal-body">
                        <div id="skillsLeaderboard" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
                                                {val} skill{val > 1 ? "s" : ""}
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

            <ModuleModal open={detailOpen} shown={detailShown} onBackdrop={() => closeModal(setDetailOpen, setDetailShown, () => setViewingSkillId(null))}>
                <div className="modal-content">
                    <div className="modal-header">
                        <h3 style={{ margin: "0 auto", color: "#fbbf24" }}>{viewing?.title || "Skill Detail"}</h3>
                        <span className="close-btn" onClick={() => closeModal(setDetailOpen, setDetailShown, () => setViewingSkillId(null))}>&times;</span>
                    </div>
                    <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                        <div style={{ fontSize: "0.85rem", color: "#9ca3af", display: "flex", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: 8 }}>
                            {viewing ? <span>By : <strong>{viewing.author}</strong></span> : null}
                        </div>
                        <div style={{ whiteSpace: "pre-line", color: "#e5e7eb", lineHeight: 1.5, fontSize: "0.95rem" }}>{viewing?.body || ""}</div>
                    </div>
                </div>
            </ModuleModal>

            <ModuleModal open={editOpen} shown={editShown} onBackdrop={() => closeModal(setEditOpen, setEditShown)}>
                <div className="modal-content">
                    <div className="modal-header">
                        <h3 style={{ margin: "0 auto", color: "#fbbf24" }}><i className="fa-solid fa-pen"></i> Edit Shared Skill</h3>
                        <span className="close-btn" onClick={() => closeModal(setEditOpen, setEditShown)}>&times;</span>
                    </div>
                    <div className="modal-body">
                        <label htmlFor="editSkillAuthor" style={{ fontSize: "0.85rem", color: "#9ca3af", display: "block", marginBottom: 6 }}>Your Name</label>
                        <input type="text" id="editSkillAuthor" placeholder="e.g. Alice" required value={editAuthor} onChange={(e) => setEditAuthor(e.target.value)} style={{ padding: "8px 12px", fontSize: "0.85rem" }} />

                        <label htmlFor="editSkillTitle" style={{ fontSize: "0.85rem", color: "#9ca3af", display: "block", marginBottom: 6, marginTop: 14 }}>Skill Title</label>
                        <input type="text" id="editSkillTitle" placeholder="e.g. Clean Git Rebase Workflow" required value={editTitle} onChange={(e) => setEditTitle(e.target.value)} style={{ padding: "8px 12px", fontSize: "0.85rem" }} />

                        <label htmlFor="editSkillDesc" style={{ fontSize: "0.85rem", color: "#9ca3af", display: "block", marginBottom: 6, marginTop: 14 }}>Guidance Details</label>
                        <textarea id="editSkillDesc" placeholder="Describe the skills, commands, or advice clearly..." required value={editDesc} onChange={(e) => setEditDesc(e.target.value)} style={{ minHeight: 100, padding: "8px 12px", fontSize: "0.85rem" }}></textarea>

                        <button type="button" onClick={saveEditSkill} style={{ marginTop: 20, background: "#fbbf24", borderColor: "#fbbf24", color: "#1e1b4b", fontWeight: 600, width: "100%" }}>
                            Save Changes
                        </button>
                    </div>
                </div>
            </ModuleModal>

            <ModuleModal open={shareOpen} shown={shareShown} onBackdrop={() => closeModal(setShareOpen, setShareShown)}>
                <div className="modal-content">
                    <div className="modal-header">
                        <h3 style={{ margin: "0 auto" }}> Share Skill</h3>
                        <span className="close-btn" onClick={() => closeModal(setShareOpen, setShareShown)}>&times;</span>
                    </div>
                    <div className="modal-body">
                        <label htmlFor="contribName" style={{ fontSize: "0.85rem", color: "#9ca3af", display: "block", marginBottom: 6 }}>Your Name</label>
                        <input type="text" id="contribName" placeholder="e.g. Alice" required value={contribName} onChange={(e) => setContribName(e.target.value)} style={{ padding: "8px 12px", fontSize: "0.85rem" }} />

                        <label htmlFor="skillTitle" style={{ fontSize: "0.85rem", color: "#9ca3af", display: "block", marginBottom: 6, marginTop: 14 }}>Skill Title</label>
                        <input type="text" id="skillTitle" placeholder="e.g. Clean Git Rebase Workflow" required value={skillTitle} onChange={(e) => setSkillTitle(e.target.value)} style={{ padding: "8px 12px", fontSize: "0.85rem" }} />

                        <label htmlFor="skillDesc" style={{ fontSize: "0.85rem", color: "#9ca3af", display: "block", marginBottom: 6, marginTop: 14 }}>Guidance Details</label>
                        <textarea id="skillDesc" placeholder="Describe the skills, commands, or advice clearly..." required value={skillDesc} onChange={(e) => setSkillDesc(e.target.value)} style={{ minHeight: 100, padding: "8px 12px", fontSize: "0.85rem" }}></textarea>

                        <button type="button" onClick={addSkill} style={{ marginTop: 20, background: "#fbbf24", borderColor: "#fbbf24", color: "#1e1b4b", fontWeight: 600, width: "100%" }}>
                            Publish Skill
                        </button>
                    </div>
                </div>
            </ModuleModal>

            <ModuleModal open={infoOpen} shown={infoShown} onBackdrop={() => closeModal(setInfoOpen, setInfoShown)}>
                <div className="modal-content">
                    <div className="modal-header">
                        <h3 style={{ margin: "0 auto", display: "flex", alignItems: "center", gap: 8 }}>
                            <i className="fa-solid fa-circle-info" style={{ color: "#fbbf24" }}></i> Skills Repository
                        </h3>
                        <span className="close-btn" onClick={() => closeModal(setInfoOpen, setInfoShown)}>&times;</span>
                    </div>
                    <div className="modal-body" style={{ fontSize: "0.93rem", lineHeight: 1.65, color: "#9ca3af" }}>
                        <div style={{ marginBottom: 20 }}>
                            <h4 style={{ color: "#fbbf24", margin: "0 0 8px 0", fontSize: "1rem", display: "flex", alignItems: "center", gap: 7 }}>
                                <i className="fa-solid fa-bolt"></i> About this Module
                            </h4>
                            <p style={{ margin: 0 }}>A collaborative skill-sharing repository where team members document technical know-how, tooling guides, and expertise for the whole team to learn from.</p>
                        </div>
                        <div>
                            <h4 style={{ color: "#fbbf24", margin: "0 0 10px 0", fontSize: "1rem", display: "flex", alignItems: "center", gap: 7 }}>
                                <i className="fa-solid fa-list-check"></i> Key Actions
                            </h4>
                            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 9 }}>
                                <li style={{ display: "flex", alignItems: "flex-start", gap: 8 }}><i className="fa-solid fa-circle-check" style={{ color: "#fbbf24", marginTop: 3, flexShrink: 0 }}></i><span>Share a new skill guide with title and detailed guidance.</span></li>
                                <li style={{ display: "flex", alignItems: "flex-start", gap: 8 }}><i className="fa-solid fa-circle-check" style={{ color: "#fbbf24", marginTop: 3, flexShrink: 0 }}></i><span>Search skills by title, content, or contributor name.</span></li>
                                <li style={{ display: "flex", alignItems: "flex-start", gap: 8 }}><i className="fa-solid fa-circle-check" style={{ color: "#fbbf24", marginTop: 3, flexShrink: 0 }}></i><span>Click a skill card to view its full guidance details.</span></li>
                                <li style={{ display: "flex", alignItems: "flex-start", gap: 8 }}><i className="fa-solid fa-circle-check" style={{ color: "#fbbf24", marginTop: 3, flexShrink: 0 }}></i><span>View the Top Contributors leaderboard; edit or delete entries.</span></li>
                            </ul>
                        </div>
                    </div>
                </div>
            </ModuleModal>
        </div>
    );
}
