'use client';

import { useGlobalDialog } from "@/components/GlobalDialog";
import { flushActivity, trackActivity } from "@/lib/activityTracker";
import { useSession } from "@/lib/session";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { formatPortalTime, useServerClock } from "@/lib/portalTime";

const adminBtnBase = {
    background: "rgba(99, 102, 241, 0.1)",
    color: "#6366f1",
    border: "1px solid rgba(99, 102, 241, 0.2)",
};

export default function Header({ adminVisible, isAdminView, paused, onToggleAdmin, onToggleNotifications, onLogoClick }) {
    const router = useRouter();
    const pathname = usePathname();
    const { showGlobalDialog } = useGlobalDialog();
    const { logout } = useSession();
    const onObservability = pathname.startsWith("/admin/observability");
    const { nowMs, source: clockSource, timeZone } = useServerClock();

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
            <div
                className="header-clock"
                title={`Portal time (${timeZone}) · ${clockSource === "network" ? "synced" : clockSource}`}
            >
                <span className="header-clock-time" suppressHydrationWarning>
                    {nowMs ? formatPortalTime(nowMs, { withMs: false }) : "\u00a0"}
                </span>
            </div>
            <div className="active-bar-actions">
                <div className="active-list" id="activeList"></div>
                <button
                    id="adminToggleBtn"
                    type="button"
                    className="admin-toggle-btn"
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
                    <Link
                        href="/admin/observability/"
                        className="header-icon-btn"
                        title="Observability dashboard"
                        aria-current={onObservability ? "page" : undefined}
                        style={{
                            ...adminBtnBase,
                            background: onObservability ? "rgba(129, 140, 248, 0.28)" : "rgba(129, 140, 248, 0.12)",
                            color: "#a5b4fc",
                            borderColor: onObservability ? "rgba(165, 180, 252, 0.55)" : "rgba(129, 140, 248, 0.25)",
                        }}
                        onMouseOver={(e) => { e.currentTarget.style.transform = "scale(1.05)"; }}
                        onMouseOut={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
                    >
                        <i className="fa-solid fa-chart-line"></i>
                    </Link>
                ) : null}
                <button
                    id="notificationToggleBtn"
                    type="button"
                    className="header-icon-btn"
                    title={paused ? "Notifications: Paused (Click to Resume)" : "Notifications: Active (Click to Pause)"}
                    style={{
                        background: paused ? "rgba(245, 158, 11, 0.1)" : "rgba(16, 185, 129, 0.1)",
                        color: paused ? "#f59e0b" : "#10b981",
                        border: paused ? "1px solid rgba(245, 158, 11, 0.2)" : "1px solid rgba(16, 185, 129, 0.2)",
                    }}
                    onMouseOver={(e) => { e.currentTarget.style.transform = "scale(1.05)"; }}
                    onMouseOut={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
                    onClick={onToggleNotifications}
                >
                    <i className={paused ? "fa-solid fa-bell-slash" : "fa-solid fa-bell"}></i>
                </button>
                <button
                    type="button"
                    className="header-icon-btn header-logout-btn"
                    title="Log out"
                    style={{
                        background: "rgba(239, 68, 68, 0.1)",
                        color: "#ef4444",
                        border: "1px solid rgba(239, 68, 68, 0.2)",
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
