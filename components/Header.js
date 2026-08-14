'use client';

import { useGlobalDialog } from "@/components/GlobalDialog";
import { flushActivity, trackActivity } from "@/lib/activityTracker";
import { useSession } from "@/lib/session";
import { useRouter } from "next/navigation";

const adminBtnBase = {
    background: "rgba(99, 102, 241, 0.1)",
    color: "#6366f1",
    border: "1px solid rgba(99, 102, 241, 0.2)",
    borderRadius: 8,
    padding: "0 12px",
    height: 36,
    display: "flex",
    alignItems: "center",
    gap: 8,
    cursor: "pointer",
    transition: "all 0.2s ease",
    fontFamily: "var(--font-body)",
    fontSize: "0.85rem",
    fontWeight: 600,
};

export default function Header({ adminVisible, isAdminView, paused, onToggleAdmin, onToggleNotifications, onLogoClick }) {
    const router = useRouter();
    const { showGlobalDialog } = useGlobalDialog();
    const { logout } = useSession();

    const handleLogout = async () => {
        const confirmed = await showGlobalDialog({
            title: "Confirm Logout",
            message: "Are you sure you want to log out of your session?",
            type: "warning",
            confirmText: "Log Out",
            showCancel: true,
        });
        if (confirmed) {
            trackActivity("auth.logout", "/");
            await flushActivity();
            await logout();
            router.push("/login/");
        }
    };

    return (
        <header className="active-bar">
            <div className="logo" onClick={onLogoClick}>
                <span className="logo-text">HACKSTREETBOYS<span className="logo-sub">LTD</span></span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div className="active-list" id="activeList"></div>
                <button
                    id="adminToggleBtn"
                    type="button"
                    title={isAdminView ? "Switch to User View" : "Switch to Admin Console"}
                    style={{
                        ...adminBtnBase,
                        display: adminVisible ? "flex" : "none",
                        background: isAdminView ? "rgba(16, 185, 129, 0.15)" : "rgba(99, 102, 241, 0.1)",
                        color: isAdminView ? "#10b981" : "#6366f1",
                        borderColor: isAdminView ? "rgba(16, 185, 129, 0.3)" : "rgba(99, 102, 241, 0.2)",
                    }}
                    onMouseOver={(e) => { e.currentTarget.style.transform = "scale(1.05)"; }}
                    onMouseOut={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
                    onClick={onToggleAdmin}
                >
                    <i className={isAdminView ? "fa-solid fa-user-check" : "fa-solid fa-user-shield"}></i>
                    <span id="adminToggleText">{isAdminView ? "Admin Mode" : "Admin View"}</span>
                </button>
                {adminVisible && isAdminView ? (
                    <button
                        type="button"
                        title="Observability dashboard"
                        style={{
                            ...adminBtnBase,
                            background: "rgba(129, 140, 248, 0.12)",
                            color: "#a5b4fc",
                            borderColor: "rgba(129, 140, 248, 0.25)",
                            width: 36,
                            padding: 0,
                            justifyContent: "center",
                        }}
                        onMouseOver={(e) => { e.currentTarget.style.transform = "scale(1.05)"; }}
                        onMouseOut={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
                        onClick={() => router.push("/admin/observability/")}
                    >
                        <i className="fa-solid fa-chart-line"></i>
                    </button>
                ) : null}
                <button
                    id="notificationToggleBtn"
                    type="button"
                    title={paused ? "Notifications: Paused (Click to Resume)" : "Notifications: Active (Click to Pause)"}
                    style={{
                        background: paused ? "rgba(245, 158, 11, 0.1)" : "rgba(16, 185, 129, 0.1)",
                        color: paused ? "#f59e0b" : "#10b981",
                        border: paused ? "1px solid rgba(245, 158, 11, 0.2)" : "1px solid rgba(16, 185, 129, 0.2)",
                        borderRadius: 8,
                        width: 36,
                        height: 36,
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                    }}
                    onMouseOver={(e) => { e.currentTarget.style.transform = "scale(1.05)"; }}
                    onMouseOut={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
                    onClick={onToggleNotifications}
                >
                    <i className={paused ? "fa-solid fa-bell-slash" : "fa-solid fa-bell"}></i>
                </button>
                <button
                    type="button"
                    title="Log out"
                    style={{
                        background: "rgba(239, 68, 68, 0.1)",
                        color: "#ef4444",
                        border: "1px solid rgba(239, 68, 68, 0.2)",
                        borderRadius: 8,
                        width: 36,
                        height: 36,
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                    }}
                    onMouseOver={(e) => { e.currentTarget.style.background = "rgba(239, 68, 68, 0.2)"; e.currentTarget.style.transform = "scale(1.05)"; }}
                    onMouseOut={(e) => { e.currentTarget.style.background = "rgba(239, 68, 68, 0.1)"; e.currentTarget.style.transform = "scale(1)"; }}
                    onClick={handleLogout}
                >
                    <i className="fa-solid fa-right-from-bracket"></i>
                </button>
            </div>
        </header>
    );
}
