'use client';

import { useCallback, useEffect, useState } from "react";
import { get, save } from "@/lib/portalApi";

function firstDiff(a, b, path = "$") {
    if (a === b) return null;
    if (a == null || b == null || typeof a !== typeof b) {
        return `${path}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`;
    }
    if (Array.isArray(a) || Array.isArray(b)) {
        if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
            return `${path}: array length ${Array.isArray(a) ? a.length : typeof a} !== ${Array.isArray(b) ? b.length : typeof b}`;
        }
        for (let i = 0; i < a.length; i++) {
            const d = firstDiff(a[i], b[i], `${path}[${i}]`);
            if (d) return d;
        }
        return null;
    }
    if (typeof a === "object") {
        const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
        for (const key of keys) {
            const d = firstDiff(a[key], b[key], `${path}.${key}`);
            if (d) return d;
        }
        return null;
    }
    return `${path}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`;
}

export default function KernelTestPage() {
    const [status, setStatus] = useState("Loading Postgres collections…");
    const [profileLen, setProfileLen] = useState(null);
    const [roleLen, setRoleLen] = useState(null);
    const [roundTrip, setRoundTrip] = useState(null);
    const [diff, setDiff] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(true);

    const loadCollections = useCallback(async () => {
        const [profile, roleAccess] = await Promise.all([
            get("profile", { admin: false }),
            get("role_access", { admin: false }),
        ]);
        if (!Array.isArray(profile) || !Array.isArray(roleAccess)) {
            throw new Error("Expected arrays from portalApi.get");
        }
        return { profile, roleAccess };
    }, []);

    const runLoad = useCallback(async () => {
        setBusy(true);
        setError("");
        setDiff("");
        setRoundTrip(null);
        try {
            const { profile, roleAccess } = await loadCollections();
            setProfileLen(profile.length);
            setRoleLen(roleAccess.length);
            setStatus("Loaded. Review counts, then run round-trip.");
            return { profile, roleAccess };
        } catch (e) {
            setError(e.message || String(e));
            setStatus("Load failed");
            return null;
        } finally {
            setBusy(false);
        }
    }, [loadCollections]);

    const runRoundTrip = useCallback(async () => {
        setBusy(true);
        setError("");
        setDiff("");
        try {
            setStatus("GET → SAVE same arrays → GET");
            const profile = await get("profile", { admin: false });
            const roleAccess = await get("role_access", { admin: false });
            setProfileLen(profile.length);
            setRoleLen(roleAccess.length);

            await save("profile", profile, { admin: false });
            await save("role_access", roleAccess, { admin: false });

            const profileAfter = await get("profile", { admin: false });
            const roleAfter = await get("role_access", { admin: false });

            const profileDiff = firstDiff(profile, profileAfter, "profile");
            const roleDiff = firstDiff(roleAccess, roleAfter, "role_access");
            const ok = !profileDiff && !roleDiff;
            setRoundTrip(ok);
            setDiff([profileDiff, roleDiff].filter(Boolean).join("\n"));
            setStatus(ok ? "Round-trip matched — records were not reshaped." : "Round-trip differed");
        } catch (e) {
            setError(e.message || String(e));
            setStatus("Round-trip failed");
            setRoundTrip(false);
        } finally {
            setBusy(false);
        }
    }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const { profile, roleAccess } = await loadCollections();
                if (cancelled) return;
                setProfileLen(profile.length);
                setRoleLen(roleAccess.length);
                setStatus("Loaded. Review counts, then run round-trip.");
            } catch (e) {
                if (cancelled) return;
                setError(e.message || String(e));
                setStatus("Load failed");
            } finally {
                if (!cancelled) setBusy(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [loadCollections]);

    return (
        <>
            <div className="glow-bg">
                <div className="blob blob1"></div>
                <div className="blob blob2"></div>
                <div className="blob blob3"></div>
            </div>
            <main className="content-viewport">
                <div className="welcome-screen">
                    <div className="welcome-header">
                        <h1>Stage 2 kernel test</h1>
                        <p className="subtitle">{status}</p>
                    </div>
                    <div className="dashboard-grid">
                        <div className="dash-card">
                            <div className="card-icon skills-color">
                                <i className="fa-solid fa-id-card"></i>
                            </div>
                            <div className="card-info">
                                <span className="card-value">{profileLen == null ? "—" : profileLen}</span>
                                <span className="card-title">profile records</span>
                            </div>
                        </div>
                        <div className="dash-card">
                            <div className="card-icon role-access-color">
                                <i className="fa-solid fa-user-lock"></i>
                            </div>
                            <div className="card-info">
                                <span className="card-value">{roleLen == null ? "—" : roleLen}</span>
                                <span className="card-title">role_access records</span>
                            </div>
                        </div>
                        <div className="dash-card">
                            <div className="card-icon" style={{ color: roundTrip === true ? "#10b981" : roundTrip === false ? "#ef4444" : "var(--text-muted)" }}>
                                <i className="fa-solid fa-rotate"></i>
                            </div>
                            <div className="card-info">
                                <span className="card-value">
                                    {roundTrip == null ? "—" : roundTrip ? "match" : "diff"}
                                </span>
                                <span className="card-title">save round-trip</span>
                            </div>
                        </div>
                    </div>
                    {error ? (
                        <p className="subtitle" style={{ color: "#ef4444", marginTop: 16 }}>{error}</p>
                    ) : null}
                    {diff ? (
                        <p className="subtitle" style={{ color: "#fbbf24", marginTop: 16, whiteSpace: "pre-wrap" }}>{diff}</p>
                    ) : null}
                    <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 24 }}>
                        <button
                            type="button"
                            className="dock-item selected"
                            disabled={busy}
                            onClick={runLoad}
                            style={{ fontFamily: "var(--font-body)", fontSize: "0.9rem", padding: "10px 18px" }}
                        >
                            Reload lengths
                        </button>
                        <button
                            type="button"
                            className="dock-item selected"
                            disabled={busy}
                            onClick={runRoundTrip}
                            style={{ fontFamily: "var(--font-body)", fontSize: "0.9rem", padding: "10px 18px", background: "var(--accent-success)" }}
                        >
                            Save round-trip
                        </button>
                    </div>
                    <p className="quick-action-tip" style={{ marginTop: 20 }}>
                        Postgres API parity check. Round-trip writes the same arrays back and compares the result.
                    </p>
                </div>
            </main>
        </>
    );
}
