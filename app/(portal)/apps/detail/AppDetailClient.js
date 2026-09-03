'use client';

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { get, githubCommits, githubStatus, save, PortalApiError, watch } from "@/lib/portalApi";
import { nextPortalId } from "@/lib/portalTime";
import { trackActivity } from "@/lib/activityTracker";
import { isTrustedGithubMessage } from "@/lib/githubMessage";
import { useSession, clearActiveModule } from "@/lib/session";
import { sanitizeHtml } from "../html";

function nextItemId() {
    return nextPortalId();
}

const ICON_BTN = {
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "#6366f1",
    padding: 0,
    boxShadow: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.65,
    transition: "opacity 0.2s, transform 0.2s",
};

const SECONDARY = {
    padding: "6px 12px",
    fontSize: "0.85rem",
    width: "auto",
    borderRadius: 8,
};

function IconBtn({ title, onClick, className, style, children }) {
    return (
        <button
            type="button"
            className={className}
            title={title}
            style={{ ...ICON_BTN, width: 32, height: 32, fontSize: "1.15rem", ...style }}
            onMouseOver={(e) => {
                e.currentTarget.style.opacity = "1";
                e.currentTarget.style.transform = "scale(1.1)";
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

function sameId(a, b) {
    return String(a) === String(b);
}

function GithubMark() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="white" aria-hidden="true">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
        </svg>
    );
}

function ConnectGithubButton({ reconnect, onClick }) {
    return (
        <div style={{ textAlign: "center", padding: "16px 0" }}>
            {!reconnect ? (
                <p style={{ fontSize: "0.85rem", color: "#9ca3af", marginBottom: 14 }}>Connect your GitHub account to view commit history.</p>
            ) : null}
            <button
                type="button"
                onClick={onClick}
                style={{
                    width: "max-content",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    background: "#24292e",
                    color: "#fff",
                    border: "none",
                    borderRadius: 100,
                    padding: "10px 20px",
                    fontSize: "0.9rem",
                    fontWeight: 500,
                    cursor: "pointer",
                    transition: "background 0.2s",
                }}
                onMouseOver={(e) => { e.currentTarget.style.background = "#1a1e22"; }}
                onMouseOut={(e) => { e.currentTarget.style.background = "#24292e"; }}
            >
                <GithubMark />
                {reconnect ? "Reconnect GitHub" : "Connect GitHub"}
            </button>
        </div>
    );
}

export default function AppDetailClient() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { actor, isAdminView } = useSession();
    const actorRef = useRef(actor);
    const trackedAppRef = useRef(null);
    useEffect(() => { actorRef.current = actor; }, [actor]);

    const appId = searchParams.get("id");

    const [resolvedAppId, setResolvedAppId] = useState(null);
    const loading = Boolean(appId) && appId !== resolvedAppId;
    const [app, setApp] = useState(null);
    const [notFound, setNotFound] = useState(false);
    const [refreshSpin, setRefreshSpin] = useState(false);
    const [tab, setTab] = useState("description");

    const [goals, setGoals] = useState([]);
    const [goalsLoading, setGoalsLoading] = useState(false);
    const [goalsError, setGoalsError] = useState("");

    const [commitsState, setCommitsState] = useState({ kind: "idle" });

    const timers = useRef([]);
    const later = (fn, ms) => {
        const id = setTimeout(fn, ms);
        timers.current.push(id);
        return id;
    };
    useEffect(() => () => timers.current.forEach(clearTimeout), []);

    const loadAssociatedGoals = useCallback(async (currentApp) => {
        if (!currentApp || isAdminView) return;
        setGoalsLoading(true);
        setGoalsError("");
        try {
            const goalsData = await get("goals");
            const appTag = `@${(currentApp.name || "").toLowerCase()}`;
            const matchedGoals = [];
            (Array.isArray(goalsData) ? goalsData : []).forEach((record) => {
                let type = record.type;
                if (!type) {
                    type = record.weekId ? "weekly" : "annual";
                } else if (type === "short-term") {
                    type = "weekly";
                } else if (type === "long-term") {
                    type = "annual";
                }
                const resolvedPeriod = record.periodId || record.weekId || "Target";
                if (record.goals && Array.isArray(record.goals)) {
                    record.goals.forEach((goal) => {
                        if (goal.text && goal.text.toLowerCase().includes(appTag)) {
                            matchedGoals.push({
                                user: record.user,
                                type,
                                period: resolvedPeriod,
                                text: goal.text,
                                done: goal.done,
                            });
                        }
                    });
                }
            });
            setGoals(matchedGoals);
        } catch (e) {
            console.error("Error fetching associated goals:", e);
            setGoalsError("Failed to load associated goals.");
            setGoals([]);
        } finally {
            setGoalsLoading(false);
        }
    }, [isAdminView]);

    const loadGithubCommits = useCallback(async (currentApp) => {
        if (!currentApp) return;
        if (!currentApp.githubRepo) {
            setCommitsState({ kind: "no-repo" });
            return;
        }
        setCommitsState({ kind: "loading" });
        let status = { configured: false, connected: false };
        try {
            status = await githubStatus();
        } catch (e) { /* vanilla swallows status errors */ }

        if (!status.connected) {
            setCommitsState({ kind: "connect", reconnect: !!status.configured });
            return;
        }

        try {
            const commits = await githubCommits(currentApp.githubRepo);
            if (!commits.length) {
                setCommitsState({ kind: "empty" });
                return;
            }
            setCommitsState({ kind: "list", commits });
        } catch (e) {
            console.error("Error loading commits:", e);
            if (e instanceof PortalApiError && e.expired) {
                setCommitsState({ kind: "connect", reconnect: false });
                return;
            }
            setCommitsState({ kind: "error", message: e.message || "Could not load commits." });
        }
    }, []);

    const loadAppDetail = useCallback(async () => {
        setResolvedAppId(null);
        try {
            const apps = await get("apps");
            const found = (Array.isArray(apps) ? apps : []).find((a) => sameId(a.id, appId));
            if (!found) {
                setApp(null);
                setNotFound(true);
                return;
            }
            setNotFound(false);
            setApp(found);
            trackActivity("apps.view_detail", `/apps/detail/?id=${found.id}`, {
                appId: found.id,
                appName: found.name,
            });
            loadAssociatedGoals(found);
            loadGithubCommits(found);
        } catch (e) {
            console.error("Error loading apps:", e);
            setApp(null);
            setNotFound(true);
        } finally {
            setResolvedAppId(appId);
        }
    }, [appId, loadAssociatedGoals, loadGithubCommits]);

    useEffect(() => {
        if (!appId) return undefined;
        const unsub = watch("apps", (apps) => {
            const found = (Array.isArray(apps) ? apps : []).find((a) => sameId(a.id, appId));
            if (!found) {
                setApp(null);
                setNotFound(true);
                setResolvedAppId(appId);
                return;
            }
            setNotFound(false);
            setApp(found);
            loadAssociatedGoals(found);
            if (trackedAppRef.current !== String(found.id)) {
                trackedAppRef.current = String(found.id);
                trackActivity("apps.view_detail", `/apps/detail/?id=${found.id}`, {
                    appId: found.id,
                    appName: found.name,
                });
                loadGithubCommits(found);
            }
            setResolvedAppId(appId);
        }, {
            onError: (e) => {
                console.error("Error loading apps:", e);
                setApp(null);
                setNotFound(true);
                setResolvedAppId(appId);
            },
        });
        return unsub;
    }, [appId, loadAssociatedGoals, loadGithubCommits]);

    useEffect(() => {
        const onMessage = (event) => {
            if (!isTrustedGithubMessage(event)) return;
            if (event.data?.type === "GITHUB_CONNECTED") {
                if (app) loadGithubCommits(app);
            }
        };
        window.addEventListener("message", onMessage);
        return () => window.removeEventListener("message", onMessage);
    }, [app, loadGithubCommits]);

    useEffect(() => {
        if (tab !== "changelogs" || !app) return;
        trackActivity("changelog.view", `/apps/detail/?id=${app.id}`, {
            appId: app.id,
            appName: app.name,
        });
    }, [tab, app]);

    const goBackToApps = () => {
        trackActivity("apps.back_to_all", "/apps/");
        router.push("/apps/");
    };

    const closeModule = () => {
        clearActiveModule();
        router.push("/");
    };

    const handleRefreshDetail = async () => {
        setRefreshSpin(true);
        try {
            await loadAppDetail();
        } catch (e) {
            console.error("Error during manual app detail refresh:", e);
        } finally {
            later(() => setRefreshSpin(false), 500);
        }
    };

    const openGithubConnect = () => {
        const w = 500;
        const h = 640;
        const left = Math.round((screen.width / 2) - (w / 2));
        const top = Math.round((screen.height / 2) - (h / 2));
        window.open("/Internal-App/github-connect/", "GithubConnect",
            `width=${w},height=${h},top=${top},left=${left},scrollbars=no,resizable=no`);
    };

    const handleFileTicket = async () => {
        const text = prompt("Enter support ticket description:");
        if (!text || !text.trim()) return;

        const current = actorRef.current || { name: "A Team Member", email: "" };
        const apps = await get("apps");
        const next = Array.isArray(apps) ? apps.slice() : [];
        const found = next.find((a) => sameId(a.id, appId));
        if (found) {
            if (!found.tickets) found.tickets = [];
            found.tickets.push({ id: nextItemId(), text: text.trim(), status: "Open", author: current.name });
            try {
                await save("apps", next);
                setApp({ ...found });
            } catch (e) {
                console.error("Error saving apps:", e);
                alert("Failed to save data to physical database server.");
            }
        }
    };

    const handleToggleTicket = async (ticketId) => {
        const current = actorRef.current || { name: "A Team Member", email: "" };
        const apps = await get("apps");
        const next = Array.isArray(apps) ? apps.slice() : [];
        const found = next.find((a) => sameId(a.id, appId));
        if (!found) return;
        const ticket = (found.tickets || []).find((t) => sameId(t.id, ticketId));
        if (!ticket) return;
        if (ticket.author && ticket.author.toLowerCase() !== current.name.toLowerCase()) {
            alert("Permission Denied: You can only toggle support tickets you created.");
            return;
        }
        ticket.status = ticket.status === "Open" ? "Resolved" : "Open";
        try {
            await save("apps", next);
            setApp({ ...found });
        } catch (e) {
            console.error("Error saving apps:", e);
            alert("Failed to save data to physical database server.");
        }
    };

    const actorName = (actor?.name || "").toLowerCase();
    const tickets = app?.tickets || [];
    const openTickets = tickets.filter((t) => t.status === "Open").length;
    const tabs = isAdminView
        ? ["description", "changelogs", "tickets"]
        : ["description", "goals", "changelogs", "tickets"];

    if (!loading && notFound) {
        return (
            <div className="apps-module">
                <div className="container">
                    <a href="/Internal-App/apps/" className="back-link" onClick={(e) => { e.preventDefault(); goBackToApps(); }}>
                        Back to Directory
                    </a>
                    <div className="empty-state" style={{ marginTop: 40 }}>
                        <p>Application not found. It may have been deleted.</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="apps-module">
            <div className="container">
                <div
                    className="header-container"
                    style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", marginBottom: 24, borderBottom: "1px solid var(--border-color)", paddingBottom: 16 }}
                >
                    <a
                        href="/Internal-App/apps/"
                        className="back-link"
                        title="Back to directory"
                        style={{ color: "var(--text-secondary)", fontSize: "1.25rem", display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none", transition: "color 0.2s", marginBottom: 0, justifySelf: "start" }}
                        onClick={(e) => { e.preventDefault(); goBackToApps(); }}
                    >
                        <i className="fa-solid fa-arrow-left"></i>
                    </a>
                    <h2 style={{ margin: 0, borderBottom: "none", paddingBottom: 0, fontSize: "1.8rem", textAlign: "center" }}>
                        {loading ? "Loading..." : (app?.name || "Loading...")}
                    </h2>
                    <div className="header-actions-right" style={{ display: "flex", alignItems: "center", gap: 4, justifySelf: "end" }}>
                        {!isAdminView ? (
                            <IconBtn className="refresh-btn" title="Refresh app details" onClick={handleRefreshDetail}>
                                <i className={`fa-solid fa-arrows-rotate${refreshSpin ? " fa-spin" : ""}`}></i>
                            </IconBtn>
                        ) : null}
                        <IconBtn className="close-module-btn" title="Close module" onClick={closeModule}>
                            <i className="fa-solid fa-xmark"></i>
                        </IconBtn>
                    </div>
                </div>

                {loading ? (
                    <div className="detail-skeleton" aria-busy="true" aria-label="Loading app details">
                        <div className="skel-tabs">
                            <span className="skel-tab"></span>
                            <span className="skel-tab"></span>
                            <span className="skel-tab"></span>
                            {!isAdminView ? <span className="skel-tab"></span> : null}
                        </div>
                        <div className="skel-detail-card">
                            <span className="skel-line w40"></span>
                            <span className="skel-line w100"></span>
                            <span className="skel-line w100"></span>
                            <span className="skel-line w90"></span>
                            <span className="skel-line w80"></span>
                            <span className="skel-line w70"></span>
                        </div>
                    </div>
                ) : (
                    <div id="detailContent">
                        <div className="tabs-container" style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {tabs.map((name) => (
                                <button
                                    key={name}
                                    type="button"
                                    className={tab === name ? "tab-btn active" : "tab-btn"}
                                    onClick={() => setTab(name)}
                                >
                                    {name === "changelogs" ? "Changelogs" : name.charAt(0).toUpperCase() + name.slice(1)}
                                </button>
                            ))}
                        </div>

                        {tab === "description" ? (
                            <div className="tab-content">
                                <div className="card">
                                    <div
                                        className="app-desc-html"
                                        style={{ lineHeight: 1.6, color: "#cbd5e1", fontSize: "1rem" }}
                                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(app?.desc || "") }}
                                    />
                                </div>
                            </div>
                        ) : null}

                        {!isAdminView && tab === "goals" ? (
                            <div className="tab-content">
                                <div className="card">
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                                        <h4 style={{ margin: 0, color: "white" }}>Associated Goals</h4>
                                        <button type="button" className="secondary-btn" style={SECONDARY} onClick={() => loadAssociatedGoals(app)}>
                                            Refresh
                                        </button>
                                    </div>
                                    {goalsLoading ? (
                                        <div style={{ textAlign: "center", padding: 20 }}>
                                            <i className="fa-solid fa-arrows-rotate fa-spin" style={{ color: "#6366f1" }}></i>
                                        </div>
                                    ) : goalsError ? (
                                        <p style={{ color: "#ef4444", fontSize: "0.9rem", margin: 0 }}>{goalsError}</p>
                                    ) : goals.length === 0 ? (
                                        <div className="empty-state" style={{ border: "none", background: "transparent", padding: "20px 0" }}>
                                            <p style={{ margin: 0, color: "#6b7280", fontStyle: "italic" }}>No active goals have been tagged with @{app?.name} yet.</p>
                                        </div>
                                    ) : (
                                        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                                            {goals.map((mg, i) => {
                                                const badgeClass = mg.done ? "success" : "pending";
                                                const badgeText = mg.done ? "Done" : "Pending";
                                                const capitalizedType = mg.type.charAt(0).toUpperCase() + mg.type.slice(1);
                                                return (
                                                    <li key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(0,0,0,0.15)", padding: "10px 14px", borderRadius: 8, marginBottom: 8, fontSize: "0.9rem", border: "1px solid rgba(255, 255, 255, 0.03)" }}>
                                                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                                            <span style={{ color: "#cbd5e1", textDecoration: mg.done ? "line-through" : "none", opacity: mg.done ? 0.55 : 1 }}>
                                                                {mg.text}
                                                            </span>
                                                            <span style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                                                                Committed by <strong>{mg.user}</strong> during <strong>{capitalizedType} ({mg.period})</strong>
                                                            </span>
                                                        </div>
                                                        <span className={`badge ${badgeClass}`} style={{ userSelect: "none" }}>{badgeText}</span>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    )}
                                </div>
                            </div>
                        ) : null}

                        {tab === "changelogs" ? (
                            <div className="tab-content">
                                <div className="card">
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                                        <h4 style={{ margin: 0, color: "white" }}>Recent Commits</h4>
                                        <button type="button" className="secondary-btn" style={SECONDARY} onClick={() => loadGithubCommits(app)}>
                                            Refresh
                                        </button>
                                    </div>
                                    {commitsState.kind === "loading" || commitsState.kind === "idle" ? (
                                        <div style={{ textAlign: "center", padding: 20 }}></div>
                                    ) : commitsState.kind === "no-repo" ? (
                                        <div className="empty-state" style={{ border: "none", background: "transparent", padding: "20px 0" }}>
                                            <p style={{ margin: 0, color: "#6b7280", fontStyle: "italic" }}>No GitHub repository linked to this application yet.</p>
                                        </div>
                                    ) : commitsState.kind === "connect" ? (
                                        <ConnectGithubButton reconnect={commitsState.reconnect} onClick={openGithubConnect} />
                                    ) : commitsState.kind === "empty" ? (
                                        <p style={{ color: "#6b7280", fontStyle: "italic", margin: 0 }}>No commits found.</p>
                                    ) : commitsState.kind === "error" ? (
                                        <p style={{ color: "#ef4444", fontSize: "0.9rem", margin: 0 }}>{commitsState.message}</p>
                                    ) : (
                                        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                                            {commitsState.commits.map((c) => (
                                                <li key={c.sha} style={{ padding: "10px 14px", background: "rgba(0,0,0,0.15)", borderRadius: 8, marginBottom: 8, border: "1px solid rgba(255,255,255,0.03)" }}>
                                                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                                                        <span style={{ color: "#d1d5db", fontSize: "0.9rem" }}>{c.message}</span>
                                                        <a href={c.url} target="_blank" rel="noopener noreferrer" style={{ color: "#818cf8", fontSize: "0.8rem", textDecoration: "none", whiteSpace: "nowrap" }}>
                                                            {c.sha}
                                                        </a>
                                                    </div>
                                                    <div style={{ fontSize: "0.75rem", color: "#6b7280", marginTop: 4 }}>
                                                        {c.author} · {c.date ? new Date(c.date).toLocaleDateString() : ""}
                                                    </div>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </div>
                        ) : null}

                        {tab === "tickets" ? (
                            <div className="tab-content">
                                <div className="card">
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                                        <h4 style={{ margin: 0, color: "white" }}> Support Tickets</h4>
                                        <button type="button" className="secondary-btn" style={SECONDARY} onClick={handleFileTicket}>
                                            File Ticket
                                        </button>
                                    </div>
                                    {tickets.length === 0 ? (
                                        <p style={{ fontSize: "0.95rem", color: "#6b7280", fontStyle: "italic", margin: 0, padding: "10px 0" }}>No support tickets filed.</p>
                                    ) : (
                                        <>
                                            <div style={{ marginBottom: 12, fontSize: "0.85rem", color: "#9ca3af" }}>
                                                <span className={`badge ${openTickets > 0 ? "danger" : "success"}`}>
                                                    {openTickets} Open / {tickets.length} Total
                                                </span>
                                            </div>
                                            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                                                {tickets.map((t) => {
                                                    const isOwner = !t.author || t.author.toLowerCase() === actorName;
                                                    return (
                                                        <li key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(0,0,0,0.15)", padding: "10px 14px", borderRadius: 8, marginBottom: 8, fontSize: "0.9rem", border: "1px solid rgba(255, 255, 255, 0.03)" }}>
                                                            <span style={{ textDecoration: t.status === "Resolved" ? "line-through" : "none", color: t.status === "Resolved" ? "#6b7280" : "#d1d5db" }}>
                                                                {t.text} <span style={{ fontSize: "0.75rem", color: "#6b7280" }}>({t.author || "Anonymous"})</span>
                                                            </span>
                                                            <span
                                                                className={`badge ${t.status === "Resolved" ? "success" : "danger"}`}
                                                                style={{ cursor: isOwner ? "pointer" : "not-allowed", opacity: isOwner ? 1 : 0.6, userSelect: "none" }}
                                                                title={isOwner ? "Click to toggle status" : "You can only toggle tickets you created"}
                                                                onClick={() => { if (isOwner) handleToggleTicket(t.id); }}
                                                            >
                                                                {t.status}
                                                            </span>
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        </>
                                    )}
                                </div>
                            </div>
                        ) : null}
                    </div>
                )}
            </div>
        </div>
    );
}
