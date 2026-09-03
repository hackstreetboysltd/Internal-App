'use client';

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Header from "@/components/Header";
import Dock from "@/components/Dock";
import FirstTimeSetup from "@/components/FirstTimeSetup";
import ActivityTrackerBridge from "@/components/ActivityTrackerBridge";
import NotificationPanel, { useNotificationStream } from "@/components/NotificationPanel";
import { DialogProvider } from "@/components/GlobalDialog";
import { PortalDataProvider } from "@/components/PortalDataProvider";
import { SessionProvider, useSession, clearActiveModule, saveActiveModule, setAdminView } from "@/lib/session";
import { setGithubPat } from "@/lib/portalApi";
import { moduleKeyFromPath, pathForModule, displayNameForModule } from "@/lib/modules";
import { trackActivity } from "@/lib/activityTracker";
import { isTrustedGithubMessage } from "@/lib/githubMessage";

import { usePortalData } from "@/components/PortalDataProvider";

function PortalChrome({ children }) {
    const pathname = usePathname();
    const router = useRouter();
    const { isAdminView } = useSession();
    const { adminVisible } = usePortalData();
    const [panelOpen, setPanelOpen] = useState(false);
    const [feedRefresh, setFeedRefresh] = useState(0);
    const unreadCount = useNotificationStream(() => {
        setFeedRefresh((value) => value + 1);
    });

    const isDockModule = !!moduleKeyFromPath(pathname);

    useEffect(() => {
        document.body.classList.toggle("module-open", isDockModule);
        return () => document.body.classList.remove("module-open");
    }, [isDockModule]);

    useEffect(() => {
        const onMessage = (event) => {
            if (!isTrustedGithubMessage(event)) return;
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
                unreadCount={unreadCount}
                onOpenNotifications={() => setPanelOpen(true)}
                onToggleAdmin={toggleAdmin}
                onLogoClick={goDashboard}
            />
            <NotificationPanel
                open={panelOpen}
                onClose={() => setPanelOpen(false)}
                refreshToken={feedRefresh}
            />
            <main className="content-viewport">
                {children}
            </main>
            <Dock />
            <FirstTimeSetup />
        </>
    );
}

export default function PortalShell({ children }) {
    return (
        <SessionProvider requireAuth>
            <PortalDataProvider>
                <DialogProvider>
                    <PortalChrome>{children}</PortalChrome>
                </DialogProvider>
            </PortalDataProvider>
        </SessionProvider>
    );
}
