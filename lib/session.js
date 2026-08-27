'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { apiPath } from "@/lib/apiPath";
import { cacheManager } from "@/lib/cacheManager";
import { resetActivityTracker } from "@/lib/activityTracker";

export const SESSION_KEYS = {
    activeModule: "activeModule",
    isAdminView: "isAdminView",
};

const DEFAULT_ACTOR = { name: "A Team Member", email: "" };

/** @type {{ name: string, email: string, avatar?: string, uid?: string, roles?: string[] } | null} */
let cachedAuthUser = null;

/**
 * @param {{ name?: string, email?: string, avatar?: string, uid?: string, roles?: string[] } | null} user
 */
export function setAuthUserCache(user) {
    cachedAuthUser = user;
}

function readStorage(key) {
    if (typeof window === "undefined") return null;
    try {
        return sessionStorage.getItem(key);
    } catch {
        return null;
    }
}

function writeStorage(key, value) {
    if (typeof window === "undefined") return;
    sessionStorage.setItem(key, value);
    emitSession();
}

function removeStorage(key) {
    if (typeof window === "undefined") return;
    sessionStorage.removeItem(key);
    emitSession();
}

function emitSession() {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new Event("portal-session"));
}

function subscribeAdminView(onStoreChange) {
    window.addEventListener("portal-session", onStoreChange);
    return () => window.removeEventListener("portal-session", onStoreChange);
}

function getAdminViewSnapshot() {
    return readStorage(SESSION_KEYS.isAdminView) === "true";
}

function getAdminViewServerSnapshot() {
    return false;
}

export function parseSessionUser(raw) {
    if (!raw) return null;
    try {
        return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
        return null;
    }
}

/** @deprecated Auth user comes from /api/auth/me, not sessionStorage. */
export function loadSessionUser() {
    return cachedAuthUser;
}

/** @deprecated Server sessions do not expire client-side. */
export function isSessionExpired(session = cachedAuthUser) {
    return !session;
}

/**
 * @param {{ name?: string, email?: string } | null | undefined} session
 */
export function getSessionActor(session) {
    const active = session || cachedAuthUser;
    if (!active) {
        return { ...DEFAULT_ACTOR };
    }
    return {
        name: active.name || DEFAULT_ACTOR.name,
        email: active.email || "",
    };
}

export function isAdminView() {
    return readStorage(SESSION_KEYS.isAdminView) === "true";
}

export function setAdminView(nextState) {
    const value = !!nextState;
    if (value) writeStorage(SESSION_KEYS.isAdminView, "true");
    else removeStorage(SESSION_KEYS.isAdminView);
    return value;
}

export function clearMessagesVaultSession() {
    if (typeof window === "undefined") return;
    try {
        const toRemove = [];
        for (let i = 0; i < sessionStorage.length; i++) {
            const k = sessionStorage.key(i);
            if (k && (k === "messages.vault.passphrase" || k.startsWith("messages.vault."))) {
                toRemove.push(k);
            }
        }
        toRemove.forEach((k) => sessionStorage.removeItem(k));
    } catch {
        /* ignore */
    }
}

export function saveActiveModule(folderName, displayName, adminFlag) {
    writeStorage(SESSION_KEYS.activeModule, JSON.stringify({
        folderName,
        displayName,
        isAdminView: !!adminFlag,
    }));
}

export function loadActiveModule() {
    return parseSessionUser(readStorage(SESSION_KEYS.activeModule));
}

export function clearActiveModule() {
    removeStorage(SESSION_KEYS.activeModule);
}

export function clearLocalSessionState() {
    const uid = cachedAuthUser?.uid;
    removeStorage(SESSION_KEYS.activeModule);
    removeStorage(SESSION_KEYS.isAdminView);
    clearMessagesVaultSession();
    cacheManager.clearAll(uid);
    resetActivityTracker();
    cachedAuthUser = null;
}

async function fetchAuthMe() {
    const res = await fetch(apiPath("/api/auth/me"), {
        credentials: "include",
        cache: "no-store",
    });
    if (res.status === 401) {
        return null;
    }
    if (!res.ok) {
        throw new Error(`Auth check failed (${res.status})`);
    }
    return res.json();
}

/** @type {{ ready: boolean, hasSession: boolean }} */
let sessionGate = { ready: false, hasSession: false };
/** @type {Array<() => void>} */
let sessionReadyWaiters = [];

function updateSessionGate(ready, session) {
    sessionGate = { ready, hasSession: !!session };
    if (ready) {
        const waiters = sessionReadyWaiters;
        sessionReadyWaiters = [];
        waiters.forEach((fn) => fn());
    }
}

/** Resolves once SessionProvider has finished its initial /api/auth/me check. */
export function waitForSessionReady() {
    if (sessionGate.ready) return Promise.resolve(sessionGate);
    return new Promise((resolve) => {
        sessionReadyWaiters.push(() => resolve(sessionGate));
    });
}

/** Re-validate the cookie session (e.g. after a 401 from a rotated sid). */
export async function refreshAuthSession() {
    try {
        const data = await fetchAuthMe();
        if (!data?.user) {
            setAuthUserCache(null);
            updateSessionGate(true, null);
            return null;
        }
        const nextUser = {
            name: data.user.name,
            email: data.user.email,
            avatar: data.user.avatar,
            uid: data.user.uid,
            roles: data.user.roles || ["user"],
        };
        setAuthUserCache(nextUser);
        updateSessionGate(true, nextUser);
        return nextUser;
    } catch (err) {
        console.warn("Auth session refresh failed:", err);
        setAuthUserCache(null);
        updateSessionGate(true, null);
        return null;
    }
}

const SessionContext = createContext(null);

export function SessionProvider({ children, requireAuth = false }) {
    const router = useRouter();
    const pathname = usePathname();
    const [session, setSessionState] = useState(null);
    const [ready, setReady] = useState(false);
    const admin = useSyncExternalStore(
        subscribeAdminView,
        getAdminViewSnapshot,
        getAdminViewServerSnapshot,
    );

    const refreshSession = useCallback(async () => {
        try {
            const data = await fetchAuthMe();
            if (!data?.user) {
                setAuthUserCache(null);
                setSessionState(null);
                return null;
            }

            const nextUser = {
                name: data.user.name,
                email: data.user.email,
                avatar: data.user.avatar,
                uid: data.user.uid,
                roles: data.user.roles || ["user"],
            };

            setAuthUserCache(nextUser);
            setSessionState(nextUser);

            return nextUser;
        } catch (err) {
            console.warn("Session refresh failed:", err);
            setAuthUserCache(null);
            setSessionState(null);
            return null;
        }
    }, []);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                await refreshSession();
            } finally {
                if (!cancelled) setReady(true);
            }
        })();
        return () => { cancelled = true; };
    }, [refreshSession]);

    useEffect(() => {
        updateSessionGate(ready, session);
    }, [ready, session]);

    useEffect(() => {
        if (!requireAuth || !ready) return;
        if (!session && pathname !== "/login/" && pathname !== "/login") {
            let cancelled = false;
            (async () => {
                try {
                    await fetch(apiPath("/api/auth/logout"), { method: "POST", credentials: "include" });
                } catch {
                    /* ignore */
                }
                clearLocalSessionState();
                if (!cancelled) {
                    const returnTo = encodeURIComponent(pathname || "/");
                    router.replace(`/login/?returnTo=${returnTo}`);
                }
            })();
            return () => { cancelled = true; };
        }
    }, [pathname, requireAuth, ready, router, session]);

    const setSession = useCallback((next, { clearModule = false } = {}) => {
        setSessionState(next);
        setAuthUserCache(next);
        if (clearModule) {
            clearActiveModule();
            removeStorage(SESSION_KEYS.isAdminView);
        }
    }, []);

    const logout = useCallback(async () => {
        try {
            await fetch(apiPath("/api/auth/logout"), { method: "POST", credentials: "include" });
        } catch (err) {
            console.warn("Logout request failed:", err);
        }
        clearLocalSessionState();
        setSessionState(null);
        if (requireAuth) router.replace("/login/");
    }, [requireAuth, router]);

    const toggleAdminView = useCallback(() => setAdminView(!admin), [admin]);

    const value = useMemo(
        () => ({
            ready,
            session,
            setSession,
            logout,
            actor: getSessionActor(session),
            isAdminView: admin,
            setAdminView,
            toggleAdminView,
            refreshSession,
        }),
        [admin, logout, ready, refreshSession, session, setSession, toggleAdminView],
    );

    return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
    const ctx = useContext(SessionContext);
    if (!ctx) {
        throw new Error("useSession must be used within SessionProvider");
    }
    return ctx;
}
