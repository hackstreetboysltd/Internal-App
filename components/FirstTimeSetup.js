'use client';

import { useEffect, useState } from "react";
import { get, save } from "@/lib/portalApi";
import { useSession } from "@/lib/session";

export default function FirstTimeSetup() {
    const { session, setSession } = useSession();
    const [open, setOpen] = useState(false);
    const [role, setRole] = useState("");
    const [dept, setDept] = useState("");
    const [bio, setBio] = useState("");

    useEffect(() => {
        if (!session?.email) return undefined;
        let cancelled = false;
        (async () => {
            try {
                const profiles = await get("profile", { admin: false });
                const myProfile = Array.isArray(profiles)
                    ? profiles.find((p) => p.email && p.email.toLowerCase() === session.email.toLowerCase())
                    : null;
                if (!cancelled && myProfile && myProfile.approvedStatus === "approved" && myProfile.isProfileSetupComplete !== true) {
                    setRole("");
                    setDept("");
                    setBio("");
                    setOpen(true);
                }
            } catch (e) {
                console.warn("Failed to verify profile setup status:", e);
            }
        })();
        return () => { cancelled = true; };
    }, [session]);

    const onSubmit = async (e) => {
        e.preventDefault();
        if (!session?.email) return;
        try {
            let profiles = await get("profile", { admin: false });
            if (!Array.isArray(profiles)) profiles = [];
            const idx = profiles.findIndex((p) => p.email && p.email.toLowerCase() === session.email.toLowerCase());
            if (idx === -1) return;
            profiles[idx].role = role.trim();
            profiles[idx].department = dept.trim();
            profiles[idx].bio = bio.trim();
            profiles[idx].isProfileSetupComplete = true;
            await save("profile", profiles, { admin: false });
            const next = { ...session, role: role.trim(), department: dept.trim() };
            setSession(next);
            setOpen(false);
            alert("Your profile has been saved successfully. Welcome to HackstreetBoys!");
        } catch (err) {
            console.error("Failed to finalize first-time setup:", err);
            alert("Could not update profile details. Please try again.");
        }
    };

    if (!open) return null;

    const fieldStyle = { width: "100%", padding: 12, background: "rgba(15, 23, 42, 0.5)", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: 12, color: "white", fontFamily: "inherit", fontSize: "0.95rem", boxSizing: "border-box", outline: "none", transition: "border-color 0.2s" };
    const labelStyle = { display: "block", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8 };

    return (
        <div
            id="firstTimeSetupModal"
            className="session-modal"
            style={{ display: "flex" }}
            onClick={(e) => { if (e.target === e.currentTarget) e.stopPropagation(); }}
        >
            <div className="session-modal-content" style={{ maxWidth: 480, textAlign: "left", padding: 32 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                    <div style={{ width: 48, height: 48, borderRadius: "50%", background: "linear-gradient(135deg, #6366f1, #a855f7)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.4rem", color: "white", flexShrink: 0 }}>
                        <i className="fa-solid fa-user-gear"></i>
                    </div>
                    <div>
                        <h2 style={{ margin: 0, fontFamily: "var(--font-heading)", fontSize: "1.3rem", color: "white" }}>Setup Your Profile</h2>
                        <p style={{ margin: "4px 0 0 0", color: "var(--text-muted)", fontSize: "0.85rem" }}>Please customize your details before you enter the portal.</p>
                    </div>
                </div>
                <form id="setupProfileForm" onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                    <div>
                        <label htmlFor="setupRole" style={labelStyle}>Designated Role</label>
                        <input id="setupRole" type="text" placeholder="e.g. Software Engineer, UI Designer" required value={role} onChange={(e) => setRole(e.target.value)} style={fieldStyle} onFocus={(e) => { e.target.style.borderColor = "#6366f1"; }} onBlur={(e) => { e.target.style.borderColor = "rgba(255, 255, 255, 0.1)"; }} />
                    </div>
                    <div>
                        <label htmlFor="setupDept" style={labelStyle}>Team Department</label>
                        <input id="setupDept" type="text" placeholder="e.g. Development, Design, QA" required value={dept} onChange={(e) => setDept(e.target.value)} style={fieldStyle} onFocus={(e) => { e.target.style.borderColor = "#6366f1"; }} onBlur={(e) => { e.target.style.borderColor = "rgba(255, 255, 255, 0.1)"; }} />
                    </div>
                    <div>
                        <label htmlFor="setupBio" style={labelStyle}>Professional Bio</label>
                        <textarea id="setupBio" placeholder="Tell the team a bit about yourself..." required rows={4} value={bio} onChange={(e) => setBio(e.target.value)} style={{ ...fieldStyle, resize: "none" }} onFocus={(e) => { e.target.style.borderColor = "#6366f1"; }} onBlur={(e) => { e.target.style.borderColor = "rgba(255, 255, 255, 0.1)"; }} />
                    </div>
                    <button
                        type="submit"
                        style={{ background: "linear-gradient(135deg, #6366f1, #4f46e5)", color: "white", border: "none", padding: 14, borderRadius: 12, cursor: "pointer", fontWeight: 600, fontSize: "1rem", width: "100%", boxShadow: "0 8px 20px rgba(99, 102, 241, 0.3)", transition: "all 0.2s", fontFamily: "inherit" }}
                        onMouseOver={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 10px 24px rgba(99, 102, 241, 0.45)"; }}
                        onMouseOut={(e) => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "0 8px 20px rgba(99, 102, 241, 0.3)"; }}
                    >
                        Save Profile & Enter Portal
                    </button>
                </form>
            </div>
        </div>
    );
}
