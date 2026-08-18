'use client';

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { get, reject, approve, save, watch } from "@/lib/portalApi";
import { nextPortalId } from "@/lib/portalTime";
import { trackActivity } from "@/lib/activityTracker";
import { notifyTeam } from "@/lib/emailNotify";
import { useSession, clearActiveModule } from "@/lib/session";
import ItemMenu from "@/components/ItemMenu";
import BusyButton from "@/components/BusyButton";
import { useBusy } from "@/lib/useBusy";
import RteEditor from "./RteEditor";
import { getEditorHtml, stripHtml } from "./html";

function nextItemId() {
    return nextPortalId();
}

const ICON_BTN = {
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "#9ca3af",
    padding: 0,
    boxShadow: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.65,
    transition: "opacity 0.2s, transform 0.2s",
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

function SkelAppCard() {
    return (
        <div className="skel-app-card">
            <div className="skel-compact-top">
                <span className="skel-line w50"></span>
                <div className="skel-btn-pair"><span className="skel-btn"></span><span className="skel-btn"></span></div>
            </div>
            <div className="skel-app-desc">
                <span className="skel-line w100"></span>
                <span className="skel-line w90"></span>
                <span className="skel-line w70"></span>
            </div>
        </div>
    );
}

function sameId(a, b) {
    return String(a) === String(b);
}

export default function AppsClient() {
    const router = useRouter();
    const { actor, isAdminView } = useSession();
    const actorRef = useRef(actor);
    useEffect(() => { actorRef.current = actor; }, [actor]);

    const [loading, setLoading] = useState(true);
    const { busy: formBusy, runBusy: runFormBusy } = useBusy();
    const [apps, setApps] = useState([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [refreshSpin, setRefreshSpin] = useState(false);

    const [registerOpen, setRegisterOpen] = useState(false);
    const [registerShown, setRegisterShown] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const [editShown, setEditShown] = useState(false);
    const [infoOpen, setInfoOpen] = useState(false);
    const [infoShown, setInfoShown] = useState(false);

    const [appName, setAppName] = useState("");
    const [appGithubRepo, setAppGithubRepo] = useState("");
    const [registerSeed, setRegisterSeed] = useState(0);
    const registerEditorRef = useRef(null);

    const [editAppId, setEditAppId] = useState("");
    const [editAppName, setEditAppName] = useState("");
    const [editAppGithubRepo, setEditAppGithubRepo] = useState("");
    const [editSeed, setEditSeed] = useState(0);
    const [editInitialHtml, setEditInitialHtml] = useState("");
    const editEditorRef = useRef(null);

    const timers = useRef([]);
    const later = (fn, ms) => {
        const id = setTimeout(fn, ms);
        timers.current.push(id);
        return id;
    };
    useEffect(() => () => timers.current.forEach(clearTimeout), []);

    const loadApps = useCallback(async () => {
        setLoading(true);
        try {
            const list = await get("apps");
            setApps(Array.isArray(list) ? list : []);
        } catch (e) {
            console.error("Error loading apps:", e);
            setApps([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        setLoading(true);
        const unsub = watch("apps", (list) => {
            setApps(Array.isArray(list) ? list : []);
            setLoading(false);
        }, {
            onError: (e) => {
                console.error("Error loading apps:", e);
                setApps([]);
                setLoading(false);
            },
        });
        return unsub;
    }, []);

    const saveApps = async (list) => {
        try {
            await save("apps", list);
        } catch (e) {
            console.error("Error saving apps:", e);
            alert("Failed to save data to physical database server.");
        }
    };

    const q = searchQuery.toLowerCase().trim();
    const filteredApps = apps.filter((app) =>
        (app.name || "").toLowerCase().includes(q)
        || stripHtml(app.desc).toLowerCase().includes(q),
    );

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

    const openRegister = () => {
        setAppName("");
        setAppGithubRepo("");
        setRegisterSeed((n) => n + 1);
        openModal(setRegisterOpen, setRegisterShown);
    };

    const addApp = () => runFormBusy(async () => {
        const name = appName.trim();
        const desc = getEditorHtml(registerEditorRef.current);
        const githubRepo = appGithubRepo.trim();
        if (!name || !desc) return alert("Name and description are required");

        const current = actorRef.current || { name: "A Team Member", email: "" };
        const list = await get("apps");
        const next = Array.isArray(list) ? list.slice() : [];
        next.push({
            id: nextItemId(),
            name,
            desc,
            tickets: [],
            githubRepo: githubRepo || null,
            author: current.name,
        });
        await saveApps(next);

        notifyTeam({
            action: "added",
            actorName: current.name,
            itemName: name,
            module: "Apps",
            excludeEmail: current.email,
        });

        setAppName("");
        setAppGithubRepo("");
        closeModal(setRegisterOpen, setRegisterShown);
    });

    const deleteApp = async (appId) => {
        const current = actorRef.current || { name: "A Team Member", email: "" };
        const list = await get("apps");
        const deletedApp = (Array.isArray(list) ? list : []).find((a) => sameId(a.id, appId));
        if (deletedApp && deletedApp.author && deletedApp.author.toLowerCase() !== current.name.toLowerCase()) {
            alert("Permission Denied: You can only delete applications you added.");
            return;
        }
        if (!confirm("Are you sure you want to remove this application from the directory?")) return;

        const filtered = (Array.isArray(list) ? list : []).filter((a) => !sameId(a.id, appId));
        await saveApps(filtered);

        notifyTeam({
            action: "deleted",
            actorName: current.name,
            itemName: deletedApp ? deletedApp.name : "an app",
            module: "Apps",
            excludeEmail: current.email,
        });
    };

    const openEdit = async (appId) => {
        const current = actorRef.current || { name: "A Team Member", email: "" };
        const list = await get("apps");
        const app = (Array.isArray(list) ? list : []).find((a) => sameId(a.id, appId));
        if (!app) return alert("App not found");
        if (app.author && app.author.toLowerCase() !== current.name.toLowerCase()) {
            alert("Permission Denied: You can only edit applications you added.");
            return;
        }
        setEditAppId(String(app.id));
        setEditAppName(app.name || "");
        setEditAppGithubRepo(app.githubRepo || "");
        setEditInitialHtml(app.desc || "");
        setEditSeed((n) => n + 1);
        openModal(setEditOpen, setEditShown);
    };

    const saveEditApp = () => runFormBusy(async () => {
        const id = Number(editAppId);
        const name = editAppName.trim();
        const desc = getEditorHtml(editEditorRef.current);
        const githubRepo = editAppGithubRepo.trim();
        if (!name || !desc) return alert("Name and description are required");

        const current = actorRef.current || { name: "A Team Member", email: "" };
        const list = await get("apps");
        const next = Array.isArray(list) ? list.slice() : [];
        const appIndex = next.findIndex((a) => sameId(a.id, id));
        if (appIndex === -1) return alert("App not found");
        if (next[appIndex].author && next[appIndex].author.toLowerCase() !== current.name.toLowerCase()) {
            alert("Permission Denied: You can only edit applications you added.");
            return;
        }

        next[appIndex].name = name;
        next[appIndex].desc = desc;
        next[appIndex].githubRepo = githubRepo || null;
        await saveApps(next);

        notifyTeam({
            action: "edited",
            actorName: current.name,
            itemName: name,
            module: "Apps",
            excludeEmail: current.email,
        });

        closeModal(setEditOpen, setEditShown);
    });

    const approvePending = async (id) => {
        if (!confirm("Approve this app registration?")) return;
        try {
            await approve("apps", id);
            await loadApps();
        } catch (e) {
            console.error(e);
            alert("Failed to approve app.");
        }
    };

    const rejectPending = async (id) => {
        if (!confirm("Reject and discard this app registration?")) return;
        try {
            await reject("apps", id);
            await loadApps();
        } catch (e) {
            console.error(e);
            alert("Failed to reject app.");
        }
    };

    const refreshApps = async () => {
        setRefreshSpin(true);
        try {
            await loadApps();
        } catch (e) {
            console.error("Error during manual apps refresh:", e);
        } finally {
            later(() => setRefreshSpin(false), 500);
        }
    };

    const actorName = (actor?.name || "").toLowerCase();

    return (
        <div className="apps-module">
            <div className="container">
                <div
                    className="header-container"
                    style={{ display: "grid", gridTemplateColumns: "40px 1fr auto", alignItems: "center", marginBottom: 24, borderBottom: "1px solid var(--border-color)", paddingBottom: 16 }}
                >
                    <div></div>
                    <h2 style={{ margin: "0 auto", borderBottom: "none", paddingBottom: 0, fontSize: "1.8rem", display: "flex", alignItems: "center", gap: 10 }}>
                        Our Digital Suite
                        <IconBtn title="About this module" onClick={() => openModal(setInfoOpen, setInfoShown)} style={{ width: "auto", height: "auto", fontSize: "1rem" }} hoverScale={1.15}>
                            <i className="fa-solid fa-circle-info"></i>
                        </IconBtn>
                    </h2>
                    <div className="header-actions-right" style={{ display: "flex", alignItems: "center", gap: 4, justifySelf: "end" }}>
                        {!isAdminView ? (
                            <IconBtn className="refresh-btn" title="Refresh digital suite data" onClick={refreshApps}>
                                <i className={`fa-solid fa-arrows-rotate${refreshSpin ? " fa-spin" : ""}`}></i>
                            </IconBtn>
                        ) : null}
                        <IconBtn className="close-module-btn" title="Close module" onClick={closeModule}>
                            <i className="fa-solid fa-xmark"></i>
                        </IconBtn>
                    </div>
                </div>

                <div className="header-actions" style={{ marginBottom: 24 }}>
                    <div className="search-input-wrapper">
                        <input
                            type="text"
                            id="searchApps"
                            placeholder="Search keyword..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <div className="header-actions-primary">
                        <button type="button" className="new-app-btn" onClick={openRegister}>
                            New App
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="apps-skeleton" aria-busy="true" aria-label="Loading apps">
                        <SkelAppCard /><SkelAppCard /><SkelAppCard /><SkelAppCard /><SkelAppCard /><SkelAppCard />
                    </div>
                ) : (
                    <div id="appsContent">
                        <div id="appList" className="apps-grid">
                            {filteredApps.length === 0 ? (
                                <div className="empty-state" style={{ gridColumn: "1 / -1" }}>
                                    <p>{q ? "No applications match your search query." : "No apps registered yet. Click \"Add New App\" to get started."}</p>
                                </div>
                            ) : (
                                filteredApps.map((app) => {
                                    const isOwner = !app.author || app.author.toLowerCase() === actorName;
                                    return (
                                        <div
                                            key={app.pendingId || app.id}
                                            className="card clickable-card"
                                            onClick={() => {
                                                trackActivity("apps.view_detail", `/apps/detail/?id=${app.id}`, {
                                                    appId: app.id,
                                                    appName: app.name,
                                                });
                                                router.push(`/apps/detail/?id=${app.id}`);
                                            }}
                                        >
                                            <div className="app-card-top">
                                                <h4 title={app.name}>
                                                    <span className="app-card-title">{app.name}</span>
                                                    {isAdminView && app.pendingType ? (
                                                        <span
                                                            className="badge"
                                                            style={{
                                                                fontSize: "0.7rem",
                                                                padding: "2px 6px",
                                                                marginLeft: 6,
                                                                background: app.pendingType === "create" ? "rgba(16,185,129,0.15)" : "rgba(99,102,241,0.15)",
                                                                color: app.pendingType === "create" ? "#10b981" : "#6366f1",
                                                                border: `1px solid ${app.pendingType === "create" ? "rgba(16,185,129,0.3)" : "rgba(99,102,241,0.3)"}`,
                                                            }}
                                                        >
                                                            {app.pendingType.toUpperCase()}
                                                        </span>
                                                    ) : null}
                                                </h4>
                                                {isAdminView && app.pendingId ? (
                                                    <div className="app-card-actions" onClick={(e) => e.stopPropagation()}>
                                                        <button
                                                            type="button"
                                                            className="secondary-btn"
                                                            style={{ padding: "6px 10px", fontSize: "0.75rem", width: "auto", borderRadius: 6, background: "rgba(16, 185, 129, 0.15)", color: "#10b981", border: "1px solid rgba(16, 185, 129, 0.2)", transition: "all 0.2s" }}
                                                            onClick={() => approvePending(app.pendingId)}
                                                        >
                                                            Approve
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="secondary-btn"
                                                            style={{ padding: "6px 10px", fontSize: "0.75rem", width: "auto", borderRadius: 6, background: "rgba(239, 68, 68, 0.15)", color: "#ef4444", border: "1px solid rgba(239, 68, 68, 0.2)", transition: "all 0.2s" }}
                                                            onClick={() => rejectPending(app.pendingId)}
                                                        >
                                                            Reject
                                                        </button>
                                                    </div>
                                                ) : !isAdminView && isOwner ? (
                                                    <div className="app-card-actions" onClick={(e) => e.stopPropagation()}>
                                                        <ItemMenu
                                                            items={[
                                                                { label: "Edit", onClick: () => openEdit(app.id) },
                                                                { label: "Delete", onClick: () => deleteApp(app.id), danger: true },
                                                            ]}
                                                        />
                                                    </div>
                                                ) : null}
                                            </div>
                                            <p className="app-card-desc">
                                                {stripHtml(app.desc)}
                                            </p>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                )}
            </div>

            <ModuleModal open={registerOpen} shown={registerShown} onBackdrop={() => closeModal(setRegisterOpen, setRegisterShown)}>
                <div className="modal-content">
                    <div className="modal-header">
                        <h3 style={{ margin: "0 auto" }}>Register New App</h3>
                        <span className="close-btn" onClick={() => closeModal(setRegisterOpen, setRegisterShown)}>&times;</span>
                    </div>
                    <div className="modal-body">
                        <label htmlFor="appName" style={{ fontSize: "0.85rem", color: "#9ca3af", display: "block", marginBottom: 6 }}>App Name</label>
                        <input type="text" id="appName" placeholder="e.g. HR Portal Dashboard" value={appName} onChange={(e) => setAppName(e.target.value)} required />

                        <label style={{ fontSize: "0.85rem", color: "#9ca3af", display: "block", marginBottom: 6 }}>App Description</label>
                        <RteEditor
                            seedKey={registerSeed}
                            initialHtml=""
                            placeholder="e.g. Backoffice tool managing employee documents and time-off tracking."
                            editorRef={registerEditorRef}
                        />

                        <label htmlFor="appGithubRepo" style={{ fontSize: "0.85rem", color: "#9ca3af", display: "block", marginBottom: 6, marginTop: 12 }}>GitHub Repo (optional)</label>
                        <input type="text" id="appGithubRepo" placeholder="e.g. octocat/hello-world" value={appGithubRepo} onChange={(e) => setAppGithubRepo(e.target.value)} />

                        <BusyButton type="button" busy={formBusy} busyLabel="Registering…" onClick={addApp}> Register App</BusyButton>
                    </div>
                </div>
            </ModuleModal>

            <ModuleModal open={editOpen} shown={editShown} onBackdrop={() => closeModal(setEditOpen, setEditShown)}>
                <div className="modal-content">
                    <div className="modal-header">
                        <h3 style={{ margin: "0 auto" }}>Edit App</h3>
                        <span className="close-btn" onClick={() => closeModal(setEditOpen, setEditShown)}>&times;</span>
                    </div>
                    <div className="modal-body">
                        <label htmlFor="editAppName" style={{ fontSize: "0.85rem", color: "#9ca3af", display: "block", marginBottom: 6 }}>App Name</label>
                        <input type="text" id="editAppName" placeholder="e.g. HR Portal Dashboard" value={editAppName} onChange={(e) => setEditAppName(e.target.value)} required />

                        <label style={{ fontSize: "0.85rem", color: "#9ca3af", display: "block", marginBottom: 6 }}>App Description</label>
                        <RteEditor
                            seedKey={editSeed}
                            initialHtml={editInitialHtml}
                            placeholder="e.g. Backoffice tool managing employee documents and time-off tracking."
                            editorRef={editEditorRef}
                        />

                        <label htmlFor="editAppGithubRepo" style={{ fontSize: "0.85rem", color: "#9ca3af", display: "block", marginBottom: 6, marginTop: 12 }}>GitHub Repo (optional)</label>
                        <input type="text" id="editAppGithubRepo" placeholder="e.g. octocat/hello-world" value={editAppGithubRepo} onChange={(e) => setEditAppGithubRepo(e.target.value)} />

                        <BusyButton type="button" busy={formBusy} busyLabel="Saving…" onClick={saveEditApp}> Save Changes</BusyButton>
                    </div>
                </div>
            </ModuleModal>

            <ModuleModal open={infoOpen} shown={infoShown} onBackdrop={() => closeModal(setInfoOpen, setInfoShown)}>
                <div className="modal-content">
                    <div className="modal-header">
                        <h3 style={{ margin: "0 auto", display: "flex", alignItems: "center", gap: 8 }}>
                            <i className="fa-solid fa-circle-info" style={{ color: "#6366f1" }}></i> Apps Registry
                        </h3>
                        <span className="close-btn" onClick={() => closeModal(setInfoOpen, setInfoShown)}>&times;</span>
                    </div>
                    <div className="modal-body" style={{ fontSize: "0.93rem", lineHeight: 1.65, color: "#9ca3af" }}>
                        <div style={{ marginBottom: 20 }}>
                            <h4 style={{ color: "#6366f1", margin: "0 0 8px 0", fontSize: "1rem", display: "flex", alignItems: "center", gap: 7 }}>
                                <i className="fa-solid fa-layer-group"></i> About this Module
                            </h4>
                            <p style={{ margin: 0 }}>A centralized directory of all internal suite tools and custom applications built for the HackstreetBoys team. Lists every active system, its purpose, and relevant links.</p>
                        </div>
                        <div>
                            <h4 style={{ color: "#6366f1", margin: "0 0 10px 0", fontSize: "1rem", display: "flex", alignItems: "center", gap: 7 }}>
                                <i className="fa-solid fa-list-check"></i> Key Actions
                            </h4>
                            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 9 }}>
                                <li style={{ display: "flex", alignItems: "flex-start", gap: 8 }}><i className="fa-solid fa-circle-check" style={{ color: "#6366f1", marginTop: 3, flexShrink: 0 }}></i><span>Search registered apps by name or description.</span></li>
                                <li style={{ display: "flex", alignItems: "flex-start", gap: 8 }}><i className="fa-solid fa-circle-check" style={{ color: "#6366f1", marginTop: 3, flexShrink: 0 }}></i><span>Register a new app with a rich-text description and optional GitHub repo.</span></li>
                                <li style={{ display: "flex", alignItems: "flex-start", gap: 8 }}><i className="fa-solid fa-circle-check" style={{ color: "#6366f1", marginTop: 3, flexShrink: 0 }}></i><span>Edit an existing app&apos;s details or delete outdated entries.</span></li>
                                <li style={{ display: "flex", alignItems: "flex-start", gap: 8 }}><i className="fa-solid fa-circle-check" style={{ color: "#6366f1", marginTop: 3, flexShrink: 0 }}></i><span>Click any app card to open its full detail page with changelogs and tickets.</span></li>
                            </ul>
                        </div>
                    </div>
                </div>
            </ModuleModal>
        </div>
    );
}
