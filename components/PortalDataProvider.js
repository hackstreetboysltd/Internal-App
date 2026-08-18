'use client';

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { watch } from "@/lib/portalApi";
import { emailIsListedAdmin, sessionHasAdminRole } from "@/lib/adminAccess";
import { allowedEmailsFromRoleAccess } from "@/lib/roleAccess";
import { useSession, setAdminView } from "@/lib/session";

const PortalDataContext = createContext(null);

export function PortalDataProvider({ children }) {
    const router = useRouter();
    const { session, isAdminView } = useSession();
    const [roleAccess, setRoleAccess] = useState([]);

    useEffect(() => {
        return watch("role_access", (data) => {
            setRoleAccess(Array.isArray(data) ? data : []);
        }, { admin: false });
    }, []);

    const allowedEmails = useMemo(
        () => allowedEmailsFromRoleAccess(roleAccess),
        [roleAccess],
    );

    const adminVisible = useMemo(() => {
        if (!session?.email) return false;
        const fromSession = sessionHasAdminRole(session);
        const adminsRecord = roleAccess.find((r) => r && r.id === "admins");
        return fromSession || emailIsListedAdmin(session.email, adminsRecord?.emails);
    }, [roleAccess, session]);

    useEffect(() => {
        if (!session?.email) return;
        if (!adminVisible && isAdminView) {
            setAdminView(false);
            router.push("/");
        }
    }, [adminVisible, isAdminView, router, session?.email]);

    const value = useMemo(
        () => ({ roleAccess, allowedEmails, adminVisible }),
        [adminVisible, allowedEmails, roleAccess],
    );

    return (
        <PortalDataContext.Provider value={value}>
            {children}
        </PortalDataContext.Provider>
    );
}

export function usePortalData() {
    const ctx = useContext(PortalDataContext);
    if (!ctx) {
        throw new Error("usePortalData must be used within PortalDataProvider");
    }
    return ctx;
}
