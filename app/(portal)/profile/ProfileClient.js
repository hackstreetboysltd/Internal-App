'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { get, save, watch } from "@/lib/portalApi";
import { sendApprovalEmailToUser } from "@/lib/emailNotify";
import { useSession, clearActiveModule } from "@/lib/session";
import ItemMenu from "@/components/ItemMenu";
import BusyButton from "@/components/BusyButton";
import { useBusy } from "@/lib/useBusy";

const AVATAR_IMG_STYLE = {
    width: "100%",
    height: "100%",
    borderRadius: "50%",
    objectFit: "cover",
    display: "block",
};

const ICON_BTN = {
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "#ff7a00",
    padding: 0,
    boxShadow: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.65,
    transition: "opacity 0.2s, transform 0.2s",
};

function hasHttpAvatar(avatar) {
    return !!(avatar && (avatar.startsWith("http://") || avatar.startsWith("https://")));
}

function initialsOf(name) {
    return name ? name.split(" ").map((n) => n[0]).join("").substring(0, 2).toUpperCase() : "U";
}

function addNameAlias(profile, alias) {
    if (!profile || !alias) return;
    const key = alias.trim().toLowerCase();
    if (!key) return;
    if ((profile.name || "").trim().toLowerCase() === key) return;
    const aliases = Array.isArray(profile.nameAliases) ? profile.nameAliases.slice() : [];
    if (aliases.some((a) => (a || "").trim().toLowerCase() === key)) {
        profile.nameAliases = aliases;
        return;
    }
    aliases.push(alias.trim());
    profile.nameAliases = aliases;
}

function AvatarFace({ src, name, className }) {
    if (hasHttpAvatar(src)) {
        return (
            <div className={className} style={{ backgroundImage: "none" }}>
                {/* Google avatar URLs; next/image is out of scope for this 1:1 port */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" referrerPolicy="no-referrer" style={AVATAR_IMG_STYLE} />
            </div>
        );
    }
    return (
        <div className={className} style={{ backgroundImage: "none" }}>
            {initialsOf(name)}
        </div>
    );
}

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

function SkeletonCard() {
    return (
        <div className="skel-member-card">
            <div className="skel-member-header">
                <div className="skel-avatar"></div>
                <div className="skel-member-info">
                    <span className="skel-line w70"></span>
                    <span className="skel-line sm w50"></span>
                </div>
            </div>
            <div className="skel-member-bio">
                <span className="skel-line w100"></span>
                <span className="skel-line w80"></span>
            </div>
            <div className="skel-member-footer">
                <span className="skel-pill"></span>
                <span className="skel-line sm w40"></span>
            </div>
        </div>
    );
}

function ProfileModal({ open, shown, onBackdrop, children }) {
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

export default function ProfileClient() {
    const router = useRouter();
    const { session, setSession, isAdminView } = useSession();
    const sessionRef = useRef(session);

    const [loading, setLoading] = useState(true);
    const [allProfiles, setAllProfiles] = useState([]);
    const [allowedEmails, setAllowedEmails] = useState([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [refreshSpin, setRefreshSpin] = useState(false);

    const [myOpen, setMyOpen] = useState(false);
    const [myShown, setMyShown] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const [editShown, setEditShown] = useState(false);
    const [infoOpen, setInfoOpen] = useState(false);
    const [infoShown, setInfoShown] = useState(false);
    const [addOpen, setAddOpen] = useState(false);
    const [addShown, setAddShown] = useState(false);

    const [editName, setEditName] = useState("");
    const [editEmail, setEditEmail] = useState("");
    const [editRole, setEditRole] = useState("");
    const [editDept, setEditDept] = useState("");
    const [editBio, setEditBio] = useState("");

    const [addName, setAddName] = useState("");
    const [addEmail, setAddEmail] = useState("");
    const [addRole, setAddRole] = useState("Software Engineer");
    const [addDept, setAddDept] = useState("Development");
    const [addBio, setAddBio] = useState("");
    const [addNotify, setAddNotify] = useState(true);
    const [addBusy, setAddBusy] = useState(false);
    const { busy: editBusy, runBusy: runEditBusy } = useBusy();

    const timers = useRef([]);
    const later = (fn, ms) => {
        const id = setTimeout(fn, ms);
        timers.current.push(id);
        return id;
    };
    useEffect(() => () => timers.current.forEach(clearTimeout), []);

    useEffect(() => {
        sessionRef.current = session;
    }, [session]);

    const currentUser = session;

    const myProfile = useMemo(() => {
        if (!currentUser?.email) return null;
        return allProfiles.find((p) => p.email && p.email.toLowerCase() === currentUser.email.toLowerCase()) || null;
    }, [allProfiles, currentUser]);

    const upsertMyProfile = useCallback(async (updatedProfile) => {
        try {
            let latestProfiles = [];
            try {
                latestProfiles = await get("profile");
            } catch {
                latestProfiles = [];
            }
            if (!Array.isArray(latestProfiles)) latestProfiles = [];

            const idx = latestProfiles.findIndex(
                (p) => p.email && p.email.toLowerCase() === updatedProfile.email.toLowerCase(),
            );
            if (idx === -1) {
                latestProfiles.push(updatedProfile);
            } else {
                latestProfiles[idx] = { ...latestProfiles[idx], ...updatedProfile };
            }

            await save("profile", latestProfiles);
            setAllProfiles(latestProfiles);
        } catch (err) {
            console.error("Error upserting profile to database:", err);
        }
    }, []);

    const loadProfiles = useCallback(async () => {
        const user = sessionRef.current;
        if (!user?.email) return;
        setLoading(true);
        try {
            try {
                let profiles = await get("profile");
                if (!Array.isArray(profiles)) profiles = [];
                setAllProfiles(profiles);

                try {
                    const raData = await get("role_access");
                    const allowedRec = Array.isArray(raData) ? raData.find((r) => r.id === "allowed") : null;
                    setAllowedEmails(allowedRec ? allowedRec.emails || [] : []);
                } catch (err) {
                    console.warn("Failed to load role access allowed list:", err);
                    setAllowedEmails([]);
                }

                let mine = profiles.find(
                    (p) => p.email && p.email.toLowerCase() === user.email.toLowerCase(),
                );
                if (!mine) {
                    mine = {
                        email: user.email,
                        name: user.name,
                        avatar: user.avatar && user.avatar.startsWith("http") ? user.avatar : "",
                        role: "Software Engineer",
                        department: "Development",
                        bio: "Hi, I am new to the portal! Excited to collaborate with the team.",
                    };
                    await upsertMyProfile(mine);
                } else if (
                    user.avatar
                    && user.avatar.startsWith("http")
                    && mine.avatar !== user.avatar
                ) {
                    mine = { ...mine, avatar: user.avatar };
                    await upsertMyProfile(mine);
                }
            } catch (err) {
                console.warn("Could not load profiles, starting fresh for this session.", err);
                setAllProfiles([]);
            }
        } finally {
            setLoading(false);
        }
    }, [upsertMyProfile]);

    useEffect(() => {
        if (!session?.email) return undefined;
        const t = setTimeout(() => { loadProfiles(); }, 0);
        const u1 = watch("profile", (profiles) => {
            if (Array.isArray(profiles)) setAllProfiles(profiles);
        });
        const u2 = watch("role_access", (raData) => {
            const allowedRec = Array.isArray(raData) ? raData.find((r) => r.id === "allowed") : null;
            setAllowedEmails(allowedRec ? allowedRec.emails || [] : []);
        });
        return () => {
            clearTimeout(t);
            u1();
            u2();
        };
    }, [session?.email, loadProfiles]);

    const filteredTeammates = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        const normalizedAllowed = allowedEmails.map((e) => e.trim().toLowerCase());
        const teammates = isAdminView
            ? allProfiles
            : allProfiles.filter((p) => p.email && normalizedAllowed.includes(p.email.trim().toLowerCase()));
        return teammates.filter((p) => {
            const name = (p.name || "").toLowerCase();
            const role = (p.role || "").toLowerCase();
            const dept = (p.department || "").toLowerCase();
            const bio = (p.bio || "").toLowerCase();
            return name.includes(q) || role.includes(q) || dept.includes(q) || bio.includes(q);
        });
    }, [allProfiles, allowedEmails, isAdminView, searchQuery]);

    const closeModule = () => {
        clearActiveModule();
        router.push("/");
    };

    const openMy = () => {
        setMyOpen(true);
        later(() => setMyShown(true), 10);
    };
    const closeMy = () => {
        setMyShown(false);
        later(() => setMyOpen(false), 300);
    };

    const openEdit = () => {
        if (!myProfile) return;
        setEditName(myProfile.name || "");
        setEditEmail(myProfile.email || "");
        setEditRole(myProfile.role || "");
        setEditDept(myProfile.department || "");
        setEditBio(myProfile.bio || "");
        closeMy();
        setEditOpen(true);
        later(() => setEditShown(true), 10);
    };
    const closeEdit = (reopenMy = true) => {
        setEditShown(false);
        later(() => {
            setEditOpen(false);
            if (reopenMy) openMy();
        }, 300);
    };

    const openInfo = () => {
        setInfoOpen(true);
        later(() => setInfoShown(true), 10);
    };
    const closeInfo = () => {
        setInfoShown(false);
        later(() => setInfoOpen(false), 300);
    };

    const openAdd = () => {
        setAddName("");
        setAddEmail("");
        setAddRole("Software Engineer");
        setAddDept("Development");
        setAddBio("");
        setAddNotify(true);
        setAddOpen(true);
        later(() => setAddShown(true), 10);
    };
    const closeAdd = () => {
        setAddShown(false);
        later(() => setAddOpen(false), 300);
    };

    const rewriteGoalOwnersForProfile = async (email, oldName) => {
        try {
            const goals = await get("goals");
            if (!Array.isArray(goals)) return;
            const emailKey = (email || "").trim().toLowerCase();
            const oldKey = (oldName || "").trim().toLowerCase();
            let changed = false;
            const next = goals.map((g) => {
                if (!g) return g;
                const recordEmail = (g.email || "").trim().toLowerCase();
                const recordUser = (g.user || "").trim().toLowerCase();
                const matchesEmail = emailKey && recordEmail === emailKey;
                const matchesOldName = oldKey && recordUser === oldKey;
                if (!matchesEmail && !matchesOldName) return g;
                changed = true;
                return { ...g, email };
            });
            if (changed) {
                await save("goals", next);
            }
        } catch (e) {
            console.warn("Could not update goal owners after profile rename:", e);
        }
    };

    const saveProfileEdit = (e) => {
        e.preventDefault();
        return runEditBusy(async () => {
        const name = editName.trim();
        const role = editRole.trim();
        const dept = editDept.trim();
        const bio = editBio.trim();
        if (!name || !currentUser?.email) return;

        const myProfileIdx = allProfiles.findIndex(
            (p) => p.email && p.email.toLowerCase() === currentUser.email.toLowerCase(),
        );
        const oldName = myProfileIdx !== -1 ? (allProfiles[myProfileIdx].name || "") : (currentUser.name || "");

        const nextProfiles = allProfiles.map((p, i) => {
            if (i !== myProfileIdx) return p;
            const updated = { ...p, name, role, department: dept, bio };
            addNameAlias(updated, oldName);
            return updated;
        });
        setAllProfiles(nextProfiles);

        const mine = nextProfiles[myProfileIdx];
        if (mine) await upsertMyProfile(mine);
        await rewriteGoalOwnersForProfile(currentUser.email, oldName);

        setSession({ ...currentUser, name });
        closeEdit(true);
        });
    };

    const refreshProfiles = async () => {
        setRefreshSpin(true);
        try {
            await loadProfiles();
        } catch (e) {
            console.error("Error during manual profiles refresh:", e);
        } finally {
            later(() => setRefreshSpin(false), 500);
        }
    };

    const approveUser = async (email, name) => {
        if (!confirm(`Are you sure you want to approve access for ${name} (${email})?`)) return;
        try {
            const raData = await get("role_access");
            if (!Array.isArray(raData)) throw new Error("Invalid role access data");
            let allowedRec = raData.find((r) => r.id === "allowed");
            if (!allowedRec) {
                allowedRec = { id: "allowed", emails: [] };
                raData.push(allowedRec);
            }
            if (!allowedRec.emails) allowedRec.emails = [];
            const normalizedEmail = email.trim().toLowerCase();
            if (!allowedRec.emails.map((e) => e.toLowerCase()).includes(normalizedEmail)) {
                allowedRec.emails.push(email);
            }
            await save("role_access", raData);

            const idx = allProfiles.findIndex((p) => p.email && p.email.toLowerCase() === email.toLowerCase());
            if (idx !== -1) {
                const next = allProfiles.map((p, i) => (i === idx ? { ...p, approvedStatus: "approved" } : p));
                await save("profile", next);
            }

            await sendApprovalEmailToUser(email, name);
            await loadProfiles();
            alert(`Access for ${email} approved successfully.`);
        } catch (e) {
            console.error("Error approving user:", e);
            alert("An error occurred during approval: " + e.message);
        }
    };

    const rejectUser = async (email) => {
        if (!confirm(`Are you sure you want to reject access for ${email}?`)) return;
        try {
            const raData = await get("role_access");
            if (!Array.isArray(raData)) throw new Error("Invalid role access data");
            const allowedRec = raData.find((r) => r.id === "allowed");
            if (allowedRec && allowedRec.emails) {
                allowedRec.emails = allowedRec.emails.filter(
                    (e) => e.trim().toLowerCase() !== email.trim().toLowerCase(),
                );
            }
            await save("role_access", raData);

            const idx = allProfiles.findIndex((p) => p.email && p.email.toLowerCase() === email.toLowerCase());
            if (idx !== -1) {
                const next = allProfiles.map((p, i) => (i === idx ? { ...p, approvedStatus: "rejected" } : p));
                await save("profile", next);
            }

            await loadProfiles();
            alert(`Access for ${email} rejected.`);
        } catch (e) {
            console.error("Error rejecting user:", e);
            alert("An error occurred: " + e.message);
        }
    };

    const saveNewMember = async (e) => {
        e.preventDefault();
        const name = addName.trim();
        const email = addEmail.trim().toLowerCase();
        const role = addRole.trim() || "Software Engineer";
        const department = addDept.trim() || "Development";
        const bio = addBio.trim();
        if (!name || !email) return;

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            alert("Please enter a valid email address.");
            return;
        }

        const alreadyExists = allProfiles.some((p) => p.email && p.email.toLowerCase() === email);
        const alreadyAllowed = allowedEmails.map((item) => item.trim().toLowerCase()).includes(email);
        if (alreadyExists && alreadyAllowed) {
            alert("A member with this email already exists in the directory.");
            return;
        }

        setAddBusy(true);
        try {
            const raData = await get("role_access");
            if (!Array.isArray(raData)) throw new Error("Invalid role access data");
            let allowedRec = raData.find((r) => r.id === "allowed");
            if (!allowedRec) {
                allowedRec = { id: "allowed", emails: [] };
                raData.push(allowedRec);
            }
            if (!allowedRec.emails) allowedRec.emails = [];
            if (!allowedRec.emails.map((item) => item.toLowerCase()).includes(email)) {
                allowedRec.emails.push(email);
            }
            await save("role_access", raData);

            const newProfile = {
                email,
                name,
                avatar: "",
                role,
                department,
                bio: bio || "Team member added by admin.",
                approvedStatus: "approved",
                isProfileSetupComplete: false,
            };

            let latestProfiles = [];
            try {
                latestProfiles = await get("profile");
            } catch { /* use empty */ }
            if (!Array.isArray(latestProfiles)) latestProfiles = [];

            const idx = latestProfiles.findIndex((p) => p.email && p.email.toLowerCase() === email);
            if (idx === -1) {
                latestProfiles.push(newProfile);
            } else {
                latestProfiles[idx] = {
                    ...latestProfiles[idx],
                    ...newProfile,
                    avatar: latestProfiles[idx].avatar || "",
                };
            }
            await save("profile", latestProfiles);
            setAllProfiles(latestProfiles);
            setAllowedEmails(allowedRec.emails);

            if (addNotify) {
                await sendApprovalEmailToUser(email, name);
            }

            closeAdd();
            alert(`${name} has been added and granted portal access.`);
        } catch (err) {
            console.error("Error adding member:", err);
            alert("Could not add member: " + err.message);
        } finally {
            setAddBusy(false);
        }
    };

    const normalizedAllowed = allowedEmails.map((e) => e.trim().toLowerCase());

    return (
        <div className="profile-module">
            <div className="container">
                <div
                    className="header-container"
                    style={{ display: "grid", gridTemplateColumns: "40px 1fr auto", alignItems: "center", marginBottom: 24, borderBottom: "1px solid var(--border-color)", paddingBottom: 16 }}
                >
                    <div></div>
                    <h2 style={{ margin: "0 auto", borderBottom: "none", paddingBottom: 0, fontSize: "1.8rem", display: "flex", alignItems: "center", gap: 10 }}>
                        Profiles
                        <IconBtn title="About this module" onClick={openInfo} style={{ width: "auto", height: "auto", fontSize: "1rem" }} hoverScale={1.15}>
                            <i className="fa-solid fa-circle-info"></i>
                        </IconBtn>
                    </h2>
                    <div className="header-actions-right" style={{ display: "flex", alignItems: "center", gap: 4, justifySelf: "end" }}>
                        {!isAdminView ? (
                            <IconBtn className="refresh-btn" title="Refresh profiles data" onClick={refreshProfiles}>
                                <i className={`fa-solid fa-arrows-rotate${refreshSpin ? " fa-spin" : ""}`}></i>
                            </IconBtn>
                        ) : null}
                        <IconBtn className="close-module-btn" title="Close module" onClick={closeModule}>
                            <i className="fa-solid fa-xmark"></i>
                        </IconBtn>
                    </div>
                </div>

                <div className="header-actions" style={{ marginBottom: 24, display: "flex", gap: 16, alignItems: "center" }}>
                    <div className="search-input-wrapper" style={{ flex: 1 }}>
                        <input
                            type="text"
                            id="searchTeammates"
                            placeholder="Search keyword..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <div className="header-actions-tools">
                        <button
                            type="button"
                            onClick={openMy}
                            className="avatar-btn"
                            id="myProfileButton"
                            title="My Profile"
                            style={
                                hasHttpAvatar(myProfile?.avatar)
                                    ? { backgroundImage: "none" }
                                    : { backgroundImage: "none", fontSize: 14, fontWeight: "bold" }
                            }
                        >
                            {hasHttpAvatar(myProfile?.avatar) ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={myProfile.avatar} alt="" referrerPolicy="no-referrer" style={AVATAR_IMG_STYLE} />
                            ) : (
                                initialsOf(myProfile?.name)
                            )}
                        </button>
                    </div>
                    {isAdminView ? (
                        <div className="header-actions-primary">
                            <button
                                type="button"
                                title="Add a teammate manually"
                                onClick={openAdd}
                                style={{ width: "auto", padding: "10px 16px", fontSize: "0.88rem", whiteSpace: "nowrap", background: "linear-gradient(135deg, #ff7a00, #ff5100)", boxShadow: "0 4px 12px rgba(255, 122, 0, 0.25)" }}
                            >
                                <i className="fa-solid fa-user-plus"></i> Add Member
                            </button>
                        </div>
                    ) : null}
                </div>

                {loading ? (
                    <div id="profileLoader" className="profile-skeleton" aria-busy="true" aria-label="Loading teammates">
                        <SkeletonCard />
                        <SkeletonCard />
                        <SkeletonCard />
                        <SkeletonCard />
                        <SkeletonCard />
                        <SkeletonCard />
                    </div>
                ) : (
                    <div id="profileContent">
                        <div>
                            <h3 style={{ marginBottom: 16 }}> Teammates Directory</h3>
                            <div id="teammatesList" className="team-grid" style={{ marginBottom: 12 }}>
                                {filteredTeammates.length === 0 ? (
                                    <div className="empty-state" style={{ gridColumn: "1 / -1" }}>
                                        <p>No teammate profiles found matching your search.</p>
                                    </div>
                                ) : (
                                    filteredTeammates.map((member) => {
                                        const isMe = member.email && currentUser?.email
                                            && member.email.toLowerCase() === currentUser.email.toLowerCase();
                                        const isAllowed = member.email && normalizedAllowed.includes(member.email.trim().toLowerCase());
                                        const isRejected = member.approvedStatus === "rejected";
                                        return (
                                            <div className={`member-card${isMe ? " has-menu" : ""}`} key={member.email || member.name}>
                                                {isMe ? (
                                                    <div className="member-card-menu">
                                                        <ItemMenu
                                                            items={[
                                                                { label: "Edit profile", onClick: openEdit },
                                                            ]}
                                                        />
                                                    </div>
                                                ) : null}
                                                <div className="member-card-header">
                                                    <AvatarFace src={member.avatar} name={member.name} className="member-avatar" />
                                                    <div className="member-info">
                                                        <h4 style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                                            {member.name}
                                                            {isMe ? (
                                                                <span className="badge" style={{ fontSize: "0.7rem", padding: "2px 6px", marginLeft: 6, background: "rgba(255, 122, 0, 0.15)", color: "#ff7a00", borderColor: "rgba(255, 122, 0, 0.3)" }}>You</span>
                                                            ) : null}
                                                        </h4>
                                                        <p>{member.role || "Teammate"}</p>
                                                    </div>
                                                </div>
                                                <p className="member-bio">{member.bio || "No bio provided."}</p>
                                                <div className="member-footer" style={isAdminView ? { paddingBottom: 0 } : undefined}>
                                                    <span className="member-dept">{member.department || "General"}</span>
                                                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}> {member.email}</span>
                                                </div>
                                                {isAdminView ? (
                                                    isAllowed ? (
                                                        <div className="approval-actions" style={{ marginTop: 14, display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 12 }}>
                                                            <span className="badge" style={{ background: "rgba(16, 185, 129, 0.15)", color: "#10b981", border: "1px solid rgba(16, 185, 129, 0.3)", padding: "3px 8px", borderRadius: 6, fontSize: "0.75rem", fontWeight: 600 }}>
                                                                Approved
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <div className="approval-actions" style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 12 }}>
                                                            {isRejected ? (
                                                                <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 4 }}>
                                                                    <span className="badge" style={{ background: "rgba(244, 63, 94, 0.15)", color: "#f43f5e", border: "1px solid rgba(244, 63, 94, 0.3)", padding: "3px 8px", borderRadius: 6, fontSize: "0.75rem", fontWeight: 600 }}>
                                                                        Access Rejected
                                                                    </span>
                                                                </div>
                                                            ) : null}
                                                            <div style={{ display: "flex", gap: 8, width: "100%" }}>
                                                                <button
                                                                    type="button"
                                                                    className="btn-approve"
                                                                    style={{ flex: 1, background: "rgba(16, 185, 129, 0.12)", color: "#10b981", border: "1px solid rgba(16, 185, 129, 0.25)", borderRadius: 8, padding: 8, fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", transition: "all 0.2s", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, boxShadow: "none" }}
                                                                    onMouseOver={(e) => { e.currentTarget.style.background = "rgba(16, 185, 129, 0.25)"; e.currentTarget.style.transform = "scale(1.02)"; }}
                                                                    onMouseOut={(e) => { e.currentTarget.style.background = "rgba(16, 185, 129, 0.12)"; e.currentTarget.style.transform = "scale(1)"; }}
                                                                    onClick={() => approveUser(member.email, member.name)}
                                                                >
                                                                    <i className="fa-solid fa-check"></i> Approve
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className="btn-reject"
                                                                    style={{ flex: 1, background: "rgba(244, 63, 94, 0.12)", color: "#f43f5e", border: "1px solid rgba(244, 63, 94, 0.25)", borderRadius: 8, padding: 8, fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", transition: "all 0.2s", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, boxShadow: "none" }}
                                                                    onMouseOver={(e) => { e.currentTarget.style.background = "rgba(244, 63, 94, 0.25)"; e.currentTarget.style.transform = "scale(1.02)"; }}
                                                                    onMouseOut={(e) => { e.currentTarget.style.background = "rgba(244, 63, 94, 0.12)"; e.currentTarget.style.transform = "scale(1)"; }}
                                                                    onClick={() => rejectUser(member.email)}
                                                                >
                                                                    <i className="fa-solid fa-ban"></i> Reject
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )
                                                ) : null}
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <ProfileModal open={myOpen} shown={myShown}>
                <div className="modal-content">
                    <div className="modal-header">
                        <h3 style={{ margin: "0 auto", color: "#ff7a00" }}> My Profile</h3>
                        <span className="close-btn" onClick={closeMy}>&times;</span>
                    </div>
                    <div className="modal-body">
                        <div className="profile-header-card" style={{ marginBottom: 20 }}>
                            <AvatarFace src={myProfile?.avatar} name={myProfile?.name} className="large-avatar" />
                            <div className="profile-name">{myProfile?.name || "Loading..."}</div>
                            <div className="profile-email">{myProfile?.email || "Loading..."}</div>
                        </div>
                        <div>
                            <div className="profile-meta-label">Designated Role</div>
                            <div className="profile-meta-item">
                                <span>{myProfile?.role || "Not specified"}</span>
                            </div>
                            <div className="profile-meta-label">Team Department</div>
                            <div className="profile-meta-item">
                                <span>{myProfile?.department || "Not specified"}</span>
                            </div>
                            <div className="profile-meta-label">Professional Bio</div>
                            <div className="profile-meta-item" style={{ alignItems: "flex-start" }}>
                                <span style={{ fontStyle: "italic", lineHeight: 1.4 }}>
                                    {myProfile?.bio || "No bio provided. Say something about yourself!"}
                                </span>
                            </div>
                        </div>
                        <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
                            <button type="button" onClick={openEdit}> Edit Profile</button>
                        </div>
                    </div>
                </div>
            </ProfileModal>

            <ProfileModal open={editOpen} shown={editShown}>
                <form id="editProfileForm" onSubmit={saveProfileEdit} className="modal-content">
                    <div className="modal-header">
                        <h3> Edit Profile Details</h3>
                        <span className="close-btn" onClick={() => closeEdit(true)}>&times;</span>
                    </div>
                    <div className="modal-body">
                        <div className="profile-form-grid">
                            <div className="profile-field">
                                <label className="required" htmlFor="editName">Full Name</label>
                                <input type="text" id="editName" placeholder="e.g. Jane Doe" required value={editName} onChange={(e) => setEditName(e.target.value)} />
                            </div>
                            <div className="profile-field">
                                <label htmlFor="editEmail">Email Address</label>
                                <input type="email" id="editEmail" className="readonly-input" readOnly value={editEmail} />
                            </div>
                            <div className="profile-field">
                                <label htmlFor="editRole">Designated Role</label>
                                <input type="text" id="editRole" placeholder="e.g. Lead Security Architect" value={editRole} onChange={(e) => setEditRole(e.target.value)} />
                            </div>
                            <div className="profile-field">
                                <label htmlFor="editDept">Department</label>
                                <input type="text" id="editDept" placeholder="e.g. Platform Engineering" value={editDept} onChange={(e) => setEditDept(e.target.value)} />
                            </div>
                            <div className="profile-field full">
                                <label htmlFor="editBio">Professional Bio</label>
                                <textarea id="editBio" placeholder="Tell the team about yourself, skills, or what you work on..." value={editBio} onChange={(e) => setEditBio(e.target.value)}></textarea>
                            </div>
                        </div>
                        <BusyButton type="submit" busy={editBusy} busyLabel="Saving…" style={{ marginTop: 16 }}> Save Profile</BusyButton>
                    </div>
                </form>
            </ProfileModal>

            {isAdminView ? (
                <ProfileModal open={addOpen} shown={addShown} onBackdrop={closeAdd}>
                    <form id="addMemberForm" onSubmit={saveNewMember} className="modal-content">
                        <div className="modal-header">
                            <h3 style={{ margin: "0 auto", color: "#ff7a00", display: "flex", alignItems: "center", gap: 8 }}>
                                <i className="fa-solid fa-user-plus"></i> Add Member
                            </h3>
                            <span className="close-btn" onClick={closeAdd}>&times;</span>
                        </div>
                        <div className="modal-body">
                            <p style={{ margin: "0 0 16px 0", fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                                Pre-provision a teammate before they log in. They will be added to the directory and granted portal access.
                            </p>

                            <label className="required" htmlFor="addMemberName">Full Name</label>
                            <input type="text" id="addMemberName" placeholder="e.g. Jane Doe" required value={addName} onChange={(e) => setAddName(e.target.value)} />

                            <label className="required" htmlFor="addMemberEmail">Email Address</label>
                            <input type="email" id="addMemberEmail" placeholder="e.g. jane@company.com" required value={addEmail} onChange={(e) => setAddEmail(e.target.value)} />

                            <label htmlFor="addMemberRole">Designated Role</label>
                            <input type="text" id="addMemberRole" placeholder="e.g. Software Engineer" value={addRole} onChange={(e) => setAddRole(e.target.value)} />

                            <label htmlFor="addMemberDept">Department</label>
                            <input type="text" id="addMemberDept" placeholder="e.g. Development" value={addDept} onChange={(e) => setAddDept(e.target.value)} />

                            <label htmlFor="addMemberBio">Professional Bio</label>
                            <textarea id="addMemberBio" placeholder="Optional intro for the team directory..." value={addBio} onChange={(e) => setAddBio(e.target.value)}></textarea>

                            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, cursor: "pointer", fontWeight: 400 }}>
                                <input
                                    type="checkbox"
                                    id="addMemberNotify"
                                    checked={addNotify}
                                    onChange={(e) => setAddNotify(e.target.checked)}
                                    style={{ width: "auto", margin: 0, accentColor: "#ff7a00" }}
                                />
                                Notify them by email that access is ready
                            </label>

                            <button
                                type="submit"
                                id="addMemberSubmitBtn"
                                disabled={addBusy}
                                style={{ marginTop: 16, background: "linear-gradient(135deg, #ff7a00, #ff5100)", boxShadow: "0 4px 12px rgba(255, 122, 0, 0.25)" }}
                            >
                                {addBusy ? (
                                    <><i className="fa-solid fa-circle-notch fa-spin"></i> Adding...</>
                                ) : (
                                    <><i className="fa-solid fa-user-plus"></i> Add Member</>
                                )}
                            </button>
                        </div>
                    </form>
                </ProfileModal>
            ) : null}

            <ProfileModal open={infoOpen} shown={infoShown} onBackdrop={closeInfo}>
                <div className="modal-content">
                    <div className="modal-header">
                        <h3 style={{ margin: "0 auto", display: "flex", alignItems: "center", gap: 8 }}>
                            <i className="fa-solid fa-circle-info" style={{ color: "#ff7a00" }}></i> Profiles &amp; Directory
                        </h3>
                        <span className="close-btn" onClick={closeInfo}>&times;</span>
                    </div>
                    <div className="modal-body" style={{ fontSize: "0.93rem", lineHeight: 1.65, color: "#9ca3af" }}>
                        <div style={{ marginBottom: 20 }}>
                            <h4 style={{ color: "#ff7a00", margin: "0 0 8px 0", fontSize: "1rem", display: "flex", alignItems: "center", gap: 7 }}>
                                <i className="fa-regular fa-user"></i> About this Module
                            </h4>
                            <p style={{ margin: 0 }}>A personal profile manager and team directory. Update your role, department, and bio, and browse the full directory of active teammates.</p>
                        </div>
                        <div>
                            <h4 style={{ color: "#ff7a00", margin: "0 0 10px 0", fontSize: "1rem", display: "flex", alignItems: "center", gap: 7 }}>
                                <i className="fa-solid fa-list-check"></i> Key Actions
                            </h4>
                            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 9 }}>
                                {isAdminView ? (
                                    <>
                                        <li style={{ display: "flex", alignItems: "flex-start", gap: 8 }}><i className="fa-solid fa-circle-check" style={{ color: "#ff7a00", marginTop: 3, flexShrink: 0 }}></i><span>Use <strong>Add Member</strong> to pre-provision teammates before they log in.</span></li>
                                        <li style={{ display: "flex", alignItems: "flex-start", gap: 8 }}><i className="fa-solid fa-circle-check" style={{ color: "#ff7a00", marginTop: 3, flexShrink: 0 }}></i><span>Approve or reject pending login requests from the directory cards.</span></li>
                                        <li style={{ display: "flex", alignItems: "flex-start", gap: 8 }}><i className="fa-solid fa-circle-check" style={{ color: "#ff7a00", marginTop: 3, flexShrink: 0 }}></i><span>Click your avatar button to view and edit your own profile.</span></li>
                                        <li style={{ display: "flex", alignItems: "flex-start", gap: 8 }}><i className="fa-solid fa-circle-check" style={{ color: "#ff7a00", marginTop: 3, flexShrink: 0 }}></i><span>Search the team directory by name, role, department, or bio.</span></li>
                                    </>
                                ) : (
                                    <>
                                        <li style={{ display: "flex", alignItems: "flex-start", gap: 8 }}><i className="fa-solid fa-circle-check" style={{ color: "#ff7a00", marginTop: 3, flexShrink: 0 }}></i><span>Click your avatar button to view and edit your own profile.</span></li>
                                        <li style={{ display: "flex", alignItems: "flex-start", gap: 8 }}><i className="fa-solid fa-circle-check" style={{ color: "#ff7a00", marginTop: 3, flexShrink: 0 }}></i><span>Update your designated role, department, and professional bio.</span></li>
                                        <li style={{ display: "flex", alignItems: "flex-start", gap: 8 }}><i className="fa-solid fa-circle-check" style={{ color: "#ff7a00", marginTop: 3, flexShrink: 0 }}></i><span>Search the team directory by name, role, department, or bio.</span></li>
                                        <li style={{ display: "flex", alignItems: "flex-start", gap: 8 }}><i className="fa-solid fa-circle-check" style={{ color: "#ff7a00", marginTop: 3, flexShrink: 0 }}></i><span>Browse teammate cards to see bios and contact details.</span></li>
                                    </>
                                )}
                            </ul>
                        </div>
                    </div>
                </div>
            </ProfileModal>
        </div>
    );
}
