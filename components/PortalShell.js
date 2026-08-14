'use client';

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Header from "@/components/Header";
import Dock from "@/components/Dock";
import FirstTimeSetup from "@/components/FirstTimeSetup";
import ActivityTrackerBridge from "@/components/ActivityTrackerBridge";
import { DialogProvider } from "@/components/GlobalDialog";
import { SessionProvider, useSession, setAdminView, clearActiveModule } from "@/lib/session";
import { get, save, setGithubPat } from "@/lib/portalApi";
import { setEmailNotificationsPaused } from "@/lib/emailNotify";
import { moduleKeyFromPath, pathForModule, displayNameForModule } from "@/lib/modules";
import { saveActiveModule } from "@/lib/session";
import { trackActivity } from "@/lib/activityTracker";

function PortalChrome({ children }) {
    const pathname = usePathname();
    const router = useRouter();
    const { session, isAdminView } = useSession();
    const [adminVisible, setAdminVisible] = useState(false);
    const [paused, setPaused] = useState(false);

    const isDashboard = pathname === "/";

    useEffect(() => {
        document.body.classList.toggle("module-open", !isDashboard);
        return () => document.body.classList.remove("module-open");
    }, [isDashboard]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (!session?.email) {
                if (!cancelled) setAdminVisible(false);
                return;
            }
            try {
                const data = await get("role_access", { admin: false });
                const adminsRecord = Array.isArray(data) ? data.find((r) => r.id === "admins") : null;
                const adminEmails = (adminsRecord ? adminsRecord.emails || [] : []).map((e) => e.trim().toLowerCase());
                const isAdminUser = adminEmails.includes(session.email.trim().toLowerCase());
                if (cancelled) return;
                setAdminVisible(isAdminUser);
                if (!isAdminUser && isAdminView) {
                    setAdminView(false);
                    router.push("/");
                }
            } catch (e) {
                console.warn("Failed to check admin visibility:", e);
                if (!cancelled) setAdminVisible(true);
            }
        })();
        return () => { cancelled = true; };
    }, [isAdminView, router, session]);

    useEffect(() => {
        let cancelled = false;
        const sync = async () => {
            try {
                const data = await get("settings", { admin: false });
                let globalPaused = null;
                if (Array.isArray(data)) {
                    const globalSettings = data.find((s) => s.id === "global");
                    if (globalSettings) globalPaused = globalSettings.emailNotificationsPaused === true;
                } else if (data && typeof data === "object") {
                    globalPaused = data.emailNotificationsPaused === true;
                }
                if (globalPaused !== null && !cancelled) {
                    setEmailNotificationsPaused(globalPaused);
                    setPaused(globalPaused);
                }
            } catch {
                /* keep local */
            }
        };
        sync();
        const id = setInterval(sync, 10000);
        return () => { cancelled = true; clearInterval(id); };
    }, []);

    useEffect(() => {
        const onMessage = (event) => {
            if (!event.data) return;
            if (event.data.type === "GITHUB_CONNECTED") {
                if (event.data.token) setGithubPat(event.data.token);
            } else if (event.data.type === "GITHUB_DISCONNECTED") {
                setGithubPat(null);
            }
        };
        window.addEventListener("message", onMessage);
        return () => window.removeEventListener("message", onMessage);
    }, []);

    const toggleAdmin = () => {
        const next = setAdminView(!isAdminView);
        trackActivity("admin.toggle_view", pathname, { enabled: next });
        const key = moduleKeyFromPath(pathname);
        if (key) {
            const name = displayNameForModule(key, next);
            saveActiveModule(key, name, next);
            router.push(pathForModule(key, next));
        } else {
            router.push("/");
        }
    };

    const toggleNotifications = async () => {
        const nextState = !paused;
        setEmailNotificationsPaused(nextState);
        setPaused(nextState);
        try {
            let currentSettings = await get("settings", { admin: false });
            let payload;
            if (Array.isArray(currentSettings)) {
                let globalSettings = currentSettings.find((s) => s.id === "global");
                if (globalSettings) globalSettings.emailNotificationsPaused = nextState;
                else currentSettings.push({ id: "global", emailNotificationsPaused: nextState });
                payload = currentSettings;
            } else if (currentSettings && typeof currentSettings === "object") {
                currentSettings.emailNotificationsPaused = nextState;
                currentSettings.id = "global";
                payload = currentSettings;
            } else {
                payload = [{ id: "global", emailNotificationsPaused: nextState }];
            }
            await save("settings", payload, { admin: false });
        } catch {
            /* local only */
        }
    };

    const goDashboard = () => {
        trackActivity("nav.home", "/");
        clearActiveModule();
        router.push("/");
    };

    return (
        <>
            <ActivityTrackerBridge />
            <div className="glow-bg">
                <div className="blob blob1"></div>
                <div className="blob blob2"></div>
                <div className="blob blob3"></div>
            </div>
            <Header
                adminVisible={adminVisible}
                isAdminView={isAdminView}
                paused={paused}
                onToggleAdmin={toggleAdmin}
                onToggleNotifications={toggleNotifications}
                onLogoClick={goDashboard}
            />
            <main className="content-viewport">
                <div key={String(isAdminView)}>
                    {children}
                </div>
            </main>
            <Dock />
            <FirstTimeSetup />
        </>
    );
}

export default function PortalShell({ children }) {
    return (
        <SessionProvider requireAuth>
            <DialogProvider>
                <PortalChrome>{children}</PortalChrome>
            </DialogProvider>
        </SessionProvider>
    );
}
