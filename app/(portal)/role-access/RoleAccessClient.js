'use client';

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { get, save, watch } from "@/lib/portalApi";
import { useSession, clearActiveModule, setAdminView } from "@/lib/session";
import BusyButton from "@/components/BusyButton";
import { useBusy } from "@/lib/useBusy";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ACCENT = "#fbbf24";
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

function RoleSkeleton() {
    return (
        <div className="role-skeleton" aria-busy="true" aria-label="Loading role access">
            {[0, 1].map((panel) => (
                <div className="skel-panel" key={panel}>
                    <div className="skel-compact-top">
                        <span className="skel-line w50"></span>
                        <span className="skel-pill"></span>
                    </div>
                    <span className="skel-line sm w90"></span>
                    <span className="skel-line sm w80" style={{ marginTop: 8 }}></span>
                    {[0, 1, 2, 3, 4].map((row) => (
                        <div className="skel-email-row" key={row}>
                            <span className="skel-line w70"></span>
                            <span className="skel-btn"></span>
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
}

function dialogIcon(type) {
    if (type === "warning") return { icon: "fa-triangle-exclamation", color: "#fbbf24" };
    if (type === "error") return { icon: "fa-circle-exclamation", color: "#ef4444" };
    if (type === "success") return { icon: "fa-circle-check", color: "#10b981" };
    return { icon: "fa-circle-info", color: "#818cf8" };
}

export default function RoleAccessClient() {
    const router = useRouter();
    const { actor } = useSession();
    const actorRef = useRef(actor);
    useEffect(() => { actorRef.current = actor; }, [actor]);

    const timers = useRef([]);
    const later = (fn, ms) => {
        const id = setTimeout(fn, ms);
        timers.current.push(id);
        return id;
    };
    useEffect(() => () => timers.current.forEach(clearTimeout), []);

    const [loading, setLoading] = useState(true);
    const [allowedEmails, setAllowedEmails] = useState([]);
    const [adminEmails, setAdminEmails] = useState([]);
    const [allowedInput, setAllowedInput] = useState("");
    const [adminInput, setAdminInput] = useState("");
    const { busy: formBusy, runBusy: runFormBusy } = useBusy();

    const [infoOpen, setInfoOpen] = useState(false);
    const [infoShown, setInfoShown] = useState(false);

    const [dialog, setDialog] = useState(null);
    const [dialogShown, setDialogShown] = useState(false);

    const actorEmail = (actor?.email || "").trim().toLowerCase();

    const showDialog = useCallback(({ title, message, type = "info", confirmText = "OK", showCancel = false }) => {
        return new Promise((resolve) => {
            setDialog({ title, message, type, confirmText, showCancel, resolve });
            setTimeout(() => setDialogShown(true), 10);
        });
    }, []);

    const closeDialog = (result) => {
        setDialogShown(false);
        setTimeout(() => {
            setDialog((current) => {
                if (current?.resolve) current.resolve(result);
                return null;
            });
        }, 300);
    };

    const loadRoleAccess = useCallback(async () => {
        try {
            const data = await get("role_access");
            if (Array.isArray(data)) {
                const allowedRec = data.find((r) => r.id === "allowed");
                const adminsRec = data.find((r) => r.id === "admins");
                setAllowedEmails(allowedRec ? allowedRec.emails || [] : []);
                setAdminEmails(adminsRec ? adminsRec.emails || [] : []);
            }
        } catch (err) {
            console.warn("Could not load role access, starting fresh.", err);
            setAllowedEmails([]);
            setAdminEmails([]);
        }
    }, []);

    useEffect(() => {
        const unsub = watch("role_access", (data) => {
            if (Array.isArray(data)) {
                const allowedRec = data.find((r) => r.id === "allowed");
                const adminsRec = data.find((r) => r.id === "admins");
                setAllowedEmails(allowedRec ? allowedRec.emails || [] : []);
                setAdminEmails(adminsRec ? adminsRec.emails || [] : []);
            }
            setLoading(false);
        }, {
            onError: (err) => {
                console.warn("Could not load role access, starting fresh.", err);
                setAllowedEmails([]);
                setAdminEmails([]);
                setLoading(false);
            },
        });
        return unsub;
    }, []);

    const persist = async (nextAllowed, nextAdmins) => {
        try {
            const payload = [
                { id: "allowed", emails: nextAllowed },
                { id: "admins", emails: nextAdmins },
            ];
            await save("role_access", payload);
        } catch (err) {
            console.error("Error saving role access configuration:", err);
            await showDialog({
                title: "Save Error",
                message: "Failed to save configuration to database.",
                type: "error",
            });
        }
    };

    const addEmail = (type) => runFormBusy(async () => {
        const raw = type === "allowed" ? allowedInput : adminInput;
        const email = raw.trim().toLowerCase();
        if (!email) return;

        if (!EMAIL_REGEX.test(email)) {
            await showDialog({
                title: "Invalid Email",
                message: "Please enter a valid email address.",
                type: "warning",
            });
            return;
        }

        let nextAllowed = allowedEmails.slice();
        let nextAdmins = adminEmails.slice();

        if (type === "allowed") {
            if (nextAllowed.includes(email)) {
                await showDialog({
                    title: "Duplicate Email",
                    message: "This email is already allowed.",
                    type: "info",
                });
                return;
            }
            nextAllowed.push(email);
            setAllowedInput("");
        } else {
            if (nextAdmins.includes(email)) {
                await showDialog({
                    title: "Duplicate Email",
                    message: "This email already has admin console access.",
                    type: "info",
                });
                return;
            }
            nextAdmins.push(email);
            if (!nextAllowed.includes(email)) nextAllowed.push(email);
            setAdminInput("");
        }

        setAllowedEmails(nextAllowed);
        setAdminEmails(nextAdmins);
        await persist(nextAllowed, nextAdmins);
    });

    const removeEmail = (type, email) => runFormBusy(async () => {
        const current = actorRef.current || { email: "" };
        const me = (current.email || "").trim().toLowerCase();
        const isMe = email.toLowerCase() === me;
        let confirmed = false;

        if (type === "admins" && isMe) {
            confirmed = await showDialog({
                title: "Revoke Self Access",
                message: "WARNING: You are about to revoke your own admin console access. \n\n"
                    + "If you proceed, you will be redirected to the User View and will not be able to return to this screen without another admin authorizing your email. \n\n"
                    + "Are you absolutely sure you want to do this?",
                type: "warning",
                confirmText: "Revoke Access",
                showCancel: true,
            });
        } else {
            confirmed = await showDialog({
                title: "Revoke Access",
                message: `Are you sure you want to revoke access for ${email}?`,
                type: "warning",
                confirmText: "Revoke",
                showCancel: true,
            });
        }

        if (!confirmed) return;

        let nextAllowed = allowedEmails.slice();
        let nextAdmins = adminEmails.slice();
        if (type === "allowed") {
            nextAllowed = nextAllowed.filter((e) => e.toLowerCase() !== email.toLowerCase());
            nextAdmins = nextAdmins.filter((e) => e.toLowerCase() !== email.toLowerCase());
        } else {
            nextAdmins = nextAdmins.filter((e) => e.toLowerCase() !== email.toLowerCase());
        }

        setAllowedEmails(nextAllowed);
        setAdminEmails(nextAdmins);
        await persist(nextAllowed, nextAdmins);

        if (type === "admins" && isMe) {
            setAdminView(false);
            clearActiveModule();
            router.push("/");
        }
    });

    const closeModule = () => {
        clearActiveModule();
        router.push("/");
    };

    const openModal = (setOpen, setShown) => {
        setOpen(true);
        later(() => setShown(true), 10);
    };
    const closeModal = (setOpen, setShown) => {
        setShown(false);
        later(() => setOpen(false), 300);
    };

    const dialogMeta = dialog ? dialogIcon(dialog.type) : null;

    return (
        <div className="role-access-module">
            <div className="container">
                <div
                    className="header-container"
                    style={{ display: "grid", gridTemplateColumns: "40px 1fr auto", alignItems: "center", marginBottom: 24, borderBottom: "1px solid var(--border-color)", paddingBottom: 16 }}
                >
                    <div></div>
                    <h2 style={{ margin: "0 auto", borderBottom: "none", paddingBottom: 0, fontSize: "1.8rem", display: "flex", alignItems: "center", gap: 10 }}>
                        <i className="fa-solid fa-user-lock" style={{ color: ACCENT }}></i> Role Access Configuration
                        <IconBtn title="About this module" onClick={() => openModal(setInfoOpen, setInfoShown)} style={{ width: "auto", height: "auto", fontSize: "1rem" }} hoverScale={1.15}>
                            <i className="fa-solid fa-circle-info"></i>
                        </IconBtn>
                    </h2>
                    <div className="header-actions-right" style={{ display: "flex", alignItems: "center", gap: 4, justifySelf: "end" }}>
                        <IconBtn className="close-module-btn" title="Close module" onClick={closeModule}>
                            <i className="fa-solid fa-xmark"></i>
                        </IconBtn>
                    </div>
                </div>

                {loading ? (
                    <RoleSkeleton />
                ) : (
                    <div className="grid">
                        <div className="form-panel" style={{ position: "static" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                                <h3 style={{ marginBottom: 0 }}><i className="fa-solid fa-envelope-circle-check" style={{ color: "var(--success)" }}></i> Allowed Logins</h3>
                                <span className="badge-count">{allowedEmails.length}</span>
                            </div>
                            <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: 20, lineHeight: 1.5 }}>
                                Emails listed below are permitted to log in to the organization portal. Anyone not in this list will be rejected upon authenticating.
                            </p>
                            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
                                <input
                                    type="email"
                                    placeholder="Add email to organization..."
                                    style={{ marginBottom: 0 }}
                                    value={allowedInput}
                                    onChange={(e) => setAllowedInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            e.preventDefault();
                                            addEmail("allowed");
                                        }
                                    }}
                                />
                                <button
                                    type="button"
                                    disabled={formBusy}
                                    aria-busy={formBusy}
                                    onClick={() => addEmail("allowed")}
                                    style={{ width: "auto", padding: "0 18px", background: "linear-gradient(135deg, var(--success), #059669)", boxShadow: "0 4px 12px rgba(16, 185, 129, 0.25)", color: "white" }}
                                >
                                    {formBusy ? <i className="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> : <i className="fa-solid fa-plus"></i>}
                                </button>
                            </div>
                            <div className="list-container" style={{ maxHeight: 420, overflowY: "auto", paddingRight: 4, gap: 10 }}>
                                {allowedEmails.length === 0 ? (
                                    <div className="empty-state">
                                        <i className="fa-regular fa-envelope"></i>
                                        <p>No organization emails authorized.</p>
                                    </div>
                                ) : allowedEmails.map((email) => (
                                    <div className="email-item" key={email}>
                                        <span className="email-text">{email}</span>
                                        <button type="button" onClick={() => removeEmail("allowed", email)} className="action-trash-btn" title="Revoke Login Access">
                                            <i className="fa-solid fa-trash-can"></i>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="form-panel" style={{ position: "static" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                                <h3 style={{ marginBottom: 0 }}><i className="fa-solid fa-user-shield" style={{ color: "var(--accent)" }}></i> Admin Nav Visibility</h3>
                                <span className="badge-count">{adminEmails.length}</span>
                            </div>
                            <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: 20, lineHeight: 1.5 }}>
                                Users with these emails can see and switch to the Admin View console via the navbar button. Users not in this list will not see the Admin toggle button.
                            </p>
                            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
                                <input
                                    type="email"
                                    placeholder="Add email to admin console..."
                                    style={{ marginBottom: 0 }}
                                    value={adminInput}
                                    onChange={(e) => setAdminInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            e.preventDefault();
                                            addEmail("admins");
                                        }
                                    }}
                                />
                                <button type="button" disabled={formBusy} aria-busy={formBusy} onClick={() => addEmail("admins")} style={{ width: "auto", padding: "0 18px" }}>
                                    {formBusy ? <i className="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> : <i className="fa-solid fa-plus"></i>}
                                </button>
                            </div>
                            <div className="list-container" style={{ maxHeight: 420, overflowY: "auto", paddingRight: 4, gap: 10 }}>
                                {adminEmails.length === 0 ? (
                                    <div className="empty-state">
                                        <i className="fa-solid fa-user-shield"></i>
                                        <p>No admin console emails authorized.</p>
                                    </div>
                                ) : adminEmails.map((email) => {
                                    const isMe = email.toLowerCase() === actorEmail;
                                    return (
                                        <div className="email-item" key={email}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                <span className="email-text">{email}</span>
                                                {isMe ? <span className="badge active" style={{ fontSize: "0.65rem", padding: "1px 4px", borderRadius: 4, marginLeft: 4 }}>You</span> : null}
                                            </div>
                                            <button type="button" onClick={() => removeEmail("admins", email)} className="action-trash-btn" title="Revoke Admin Access">
                                                <i className="fa-solid fa-trash-can"></i>
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <ModuleModal open={infoOpen} shown={infoShown} onBackdrop={() => closeModal(setInfoOpen, setInfoShown)}>
                <div className="modal-content">
                    <div className="modal-header">
                        <h3 style={{ margin: "0 auto", display: "flex", alignItems: "center", gap: 8 }}>
                            <i className="fa-solid fa-circle-info" style={{ color: ACCENT }}></i> Role Access Control
                        </h3>
                        <span className="close-btn" onClick={() => closeModal(setInfoOpen, setInfoShown)}>&times;</span>
                    </div>
                    <div className="modal-body" style={{ fontSize: "0.93rem", lineHeight: 1.65, color: "var(--text-secondary)" }}>
                        <div style={{ marginBottom: 20 }}>
                            <h4 style={{ color: ACCENT, margin: "0 0 8px 0", fontSize: "1rem", display: "flex", alignItems: "center", gap: 7 }}>
                                <i className="fa-solid fa-shield-halved"></i> About this Module
                            </h4>
                            <p style={{ margin: 0 }}>This administrative panel manages organization portal logins and console toggle visibility permissions. Access rules are stored in PostgreSQL and synced on load.</p>
                        </div>
                        <div>
                            <h4 style={{ color: ACCENT, margin: "0 0 10px 0", fontSize: "1rem", display: "flex", alignItems: "center", gap: 7 }}>
                                <i className="fa-solid fa-list-check"></i> Key Features
                            </h4>
                            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 9 }}>
                                <li style={{ display: "flex", alignItems: "flex-start", gap: 8 }}><i className="fa-solid fa-circle-check" style={{ color: ACCENT, marginTop: 3, flexShrink: 0 }}></i><span><strong>Allowed Logins</strong>: Strict whitelist of Google account emails that are allowed past the login screen.</span></li>
                                <li style={{ display: "flex", alignItems: "flex-start", gap: 8 }}><i className="fa-solid fa-circle-check" style={{ color: ACCENT, marginTop: 3, flexShrink: 0 }}></i><span><strong>Admin Nav Visibility</strong>: Controls visibility of the &quot;Admin View&quot; button in the upper navbar for switched consoles.</span></li>
                                <li style={{ display: "flex", alignItems: "flex-start", gap: 8 }}><i className="fa-solid fa-circle-check" style={{ color: ACCENT, marginTop: 3, flexShrink: 0 }}></i><span><strong>Organization Protection</strong>: Users trying to login with an unlisted email will see an informational access-pending modal.</span></li>
                            </ul>
                        </div>
                    </div>
                </div>
            </ModuleModal>

            <ModuleModal open={!!dialog} shown={dialogShown} onBackdrop={dialog?.showCancel ? () => closeDialog(false) : undefined}>
                {dialog ? (
                    <div className="modal-content" style={{ maxWidth: 400, textAlign: "center", padding: 24, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
                        <div style={{ fontSize: "3.2rem", lineHeight: 1 }}>
                            <i className={`fa-solid ${dialogMeta.icon}`} style={{ color: dialogMeta.color }}></i>
                        </div>
                        <h3 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 600, color: dialogMeta.color }}>{dialog.title}</h3>
                        <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", lineHeight: 1.5, margin: 0, whiteSpace: "pre-line", textAlign: "center" }}>{dialog.message}</p>
                        <div style={{ display: "flex", gap: 12, width: "100%", marginTop: 8 }}>
                            {dialog.showCancel ? (
                                <button
                                    type="button"
                                    onClick={() => closeDialog(false)}
                                    style={{ background: "rgba(255, 255, 255, 0.08)", border: "1px solid rgba(255, 255, 255, 0.08)", color: "white", padding: "12px 20px", borderRadius: 10, cursor: "pointer", flex: 1, fontWeight: 600, fontSize: "0.95rem" }}
                                >
                                    Cancel
                                </button>
                            ) : null}
                            <button
                                type="button"
                                onClick={() => closeDialog(true)}
                                style={{ background: dialog.type === "warning" || dialog.type === "error" ? "#ef4444" : ACCENT, color: dialog.type === "warning" || dialog.type === "error" ? "white" : "#111827", border: "none", padding: "12px 20px", borderRadius: 10, cursor: "pointer", flex: 1, fontWeight: 600, fontSize: "0.95rem" }}
                            >
                                {dialog.confirmText}
                            </button>
                        </div>
                    </div>
                ) : null}
            </ModuleModal>
        </div>
    );
}
