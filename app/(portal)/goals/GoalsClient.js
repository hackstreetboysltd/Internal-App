'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { approve, get, GoalUser, reject, save, watch } from "@/lib/portalApi";
import { notifyAssigneeOfGoal, notifyTeam } from "@/lib/emailNotify";
import { useSession, clearActiveModule } from "@/lib/session";
import ItemMenu from "@/components/ItemMenu";
import BusyButton from "@/components/BusyButton";
import { useBusy } from "@/lib/useBusy";
import {
    HORIZONS,
    HORIZON_OPTIONS,
    ITEMS_PER_PAGE,
    LEADERBOARD_ITEMS_PER_PAGE,
    WORKSPACE_ITEMS_PER_PAGE,
    allowedEmailsFromRoleAccess,
    capitalize,
    cloneRecords,
    computePeriodId,
    directoryEmails,
    formatGoalCreatedStamp,
    formatGoalText,
    formatGoalTextForInput,
    formatPeriodLabel,
    getDirectoryUsers,
    getGoalCreatedTime,
    isPersonalGoalRecord,
    itemsLabelForType,
    nextDraftKey,
    nextItemId,
    persistableCollection,
    placeCaretAtEnd,
    profileNameForEmail,
    recordBelongsToEmail,
    resolveGoalType,
    sameId,
    stripTitles,
} from "./goalsHelpers";

const ACCENT = "#fb7185";
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

function IconBtn({ title, onClick, style, hoverScale = 1.1, className, children }) {
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

function WorkspaceSelect({ value, options, onChange, full, title }) {
    const [open, setOpen] = useState(false);
    const wrapRef = useRef(null);
    const selected = options.find((o) => o.value === value) || options[0];

    useEffect(() => {
        const onDoc = (e) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener("click", onDoc);
        return () => document.removeEventListener("click", onDoc);
    }, []);

    return (
        <div ref={wrapRef} className={`workspace-select${full ? " full" : ""}${open ? " open" : ""}`}>
            <button
                type="button"
                className="workspace-select-trigger"
                title={title}
                aria-haspopup="listbox"
                onClick={(e) => {
                    e.stopPropagation();
                    setOpen((v) => !v);
                }}
            >
                <span className="workspace-select-label">{selected ? selected.label : ""}</span>
                <i className="fa-solid fa-chevron-down"></i>
            </button>
            <div className="workspace-select-menu" role="listbox">
                {options.map((opt) => (
                    <div
                        key={opt.value}
                        className={`workspace-select-option${opt.value === value ? " active" : ""}`}
                        role="option"
                        aria-selected={opt.value === value}
                        onClick={(e) => {
                            e.stopPropagation();
                            if (opt.value !== value) onChange(opt.value);
                            setOpen(false);
                        }}
                    >
                        {opt.label}
                    </div>
                ))}
            </div>
        </div>
    );
}

function PaginationBar({ start, end, total, prevDisabled, nextDisabled, onPrev, onNext, compact }) {
    return (
        <div className={compact ? "workspace-pagination" : undefined} style={compact ? undefined : { display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12, marginTop: 16, fontSize: "0.85rem", color: "#9ca3af", fontWeight: 500 }}>
            <span>{start}-{end} of {total}</span>
            <div style={{ display: "flex", gap: 6 }}>
                <button type="button" onClick={onPrev} disabled={prevDisabled} style={{ width: "auto", padding: "4px 8px", fontSize: "0.8rem", background: prevDisabled ? "rgba(255,255,255,0.05)" : ACCENT, border: "none", color: prevDisabled ? "#4b5563" : "white", cursor: prevDisabled ? "not-allowed" : "pointer", borderRadius: 4 }}>
                    <i className="fa-solid fa-chevron-left"></i>
                </button>
                <button type="button" onClick={onNext} disabled={nextDisabled} style={{ width: "auto", padding: "4px 8px", fontSize: "0.8rem", background: nextDisabled ? "rgba(255,255,255,0.05)" : ACCENT, border: "none", color: nextDisabled ? "#4b5563" : "white", cursor: nextDisabled ? "not-allowed" : "pointer", borderRadius: 4 }}>
                    <i className="fa-solid fa-chevron-right"></i>
                </button>
            </div>
        </div>
    );
}

function GoalHtml({ text, apps, as, style, className }) {
    const Tag = as || "span";
    return <Tag className={className} style={style} dangerouslySetInnerHTML={{ __html: formatGoalText(text, apps) }} />;
}

function WorkspaceSkeleton() {
    return (
        <div className="goals-skeleton" aria-busy="true" aria-label="Loading goals">
            {[0, 1, 2, 3].map((i) => (
                <div className="goals-skeleton-row" key={i}>
                    <div className="goals-skeleton-check"></div>
                    <div className="goals-skeleton-body">
                        <div className="goals-skeleton-line medium"></div>
                        <div className="goals-skeleton-line short"></div>
                        <div className="goals-skeleton-line meta"></div>
                    </div>
                    <div className="goals-skeleton-stamp"><span></span><span></span></div>
                </div>
            ))}
        </div>
    );
}

function AdminSkeleton() {
    return (
        <div className="module-skeleton-grid" aria-busy="true" aria-label="Loading goals">
            {[0, 1, 2, 3, 4, 5].map((i) => (
                <div className="skel-goal-card" key={i}>
                    <div className="skel-compact-top">
                        <span className="skel-line w55"></span>
                        <div className="skel-btn-pair"><span className="skel-btn"></span><span className="skel-btn"></span></div>
                    </div>
                    <span className="skel-line sm w70"></span>
                    <div className="skel-progress"><div className="skel-progress-fill"></div></div>
                    <span className="skel-line sm w40"></span>
                </div>
            ))}
        </div>
    );
}

export default function GoalsClient() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { actor, isAdminView } = useSession();
    const actorRef = useRef(actor);
    useEffect(() => { actorRef.current = actor; }, [actor]);

    const editorRef = useRef(null);
    const dragFrom = useRef(null);
    const timers = useRef([]);
    const later = (fn, ms) => {
        const id = setTimeout(fn, ms);
        timers.current.push(id);
        return id;
    };
    useEffect(() => () => timers.current.forEach(clearTimeout), []);

    const [loading, setLoading] = useState(true);
    const [records, setRecords] = useState([]);
    const [users, setUsers] = useState([]);
    const [apps, setApps] = useState([]);
    const [allowedEmails, setAllowedEmails] = useState([]);
    const [refreshSpin, setRefreshSpin] = useState(false);

    const [searchQuery, setSearchQuery] = useState("");
    const [timeframe, setTimeframe] = useState("all");
    const [memberFilter, setMemberFilter] = useState("all");
    const [sortDir, setSortDir] = useState("desc");
    const [workspacePage, setWorkspacePage] = useState(1);
    const [currentTab, setCurrentTab] = useState("annual");
    const [adminPage, setAdminPage] = useState(1);
    const [lbPage, setLbPage] = useState(1);

    const [unifiedOpen, setUnifiedOpen] = useState(false);
    const [unifiedShown, setUnifiedShown] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [horizon, setHorizon] = useState("annual");
    const [draftItems, setDraftItems] = useState([]);
    const [editingKey, setEditingKey] = useState(null);
    const [editText, setEditText] = useState("");
    const [scope, setScope] = useState("personal");
    const [assigneeEmail, setAssigneeEmail] = useState("");
    const [tagOpen, setTagOpen] = useState(false);
    const [tagFilter, setTagFilter] = useState("");
    const [tagSearch, setTagSearch] = useState("");

    const [infoOpen, setInfoOpen] = useState(false);
    const [infoShown, setInfoShown] = useState(false);
    const [aboutOpen, setAboutOpen] = useState(false);
    const [aboutShown, setAboutShown] = useState(false);
    const [lbOpen, setLbOpen] = useState(false);
    const [lbShown, setLbShown] = useState(false);
    const [viewOpen, setViewOpen] = useState(false);
    const [viewShown, setViewShown] = useState(false);
    const [viewingId, setViewingId] = useState(null);
    const [reassignOpen, setReassignOpen] = useState(false);
    const [reassignShown, setReassignShown] = useState(false);
    const [reassigningId, setReassigningId] = useState(null);
    const [reassignFrom, setReassignFrom] = useState("");
    const [reassignTo, setReassignTo] = useState("");
    const { busy: formBusy, runBusy: runFormBusy } = useBusy();

    const [dialog, setDialog] = useState(null);
    const [dialogShown, setDialogShown] = useState(false);

    const appsRef = useRef(apps);
    useEffect(() => { appsRef.current = apps; }, [apps]);

    const showAlert = useCallback((title, message) => {
        return new Promise((resolve) => {
            setDialog({ kind: "alert", title, message, resolve });
            setTimeout(() => setDialogShown(true), 10);
        });
    }, []);

    const showConfirm = useCallback((title, message) => {
        return new Promise((resolve) => {
            setDialog({ kind: "confirm", title, message, resolve });
            setTimeout(() => setDialogShown(true), 10);
        });
    }, []);

    const closeDialog = (result) => {
        setDialogShown(false);
        later(() => {
            setDialog((current) => {
                if (current?.resolve) current.resolve(result);
                return null;
            });
        }, 200);
    };

    const goalEmail = useCallback((record) => GoalUser.resolveEmail(record, users), [users]);
    const actorOwns = useCallback((record) => GoalUser.actorOwnsRecord(record, actor, users), [actor, users]);
    const actorCanManage = useCallback((record) => GoalUser.actorCanManageRecord(record, actor, users), [actor, users]);

    const loadAll = useCallback(async () => {
        try {
            const [goalsData, profileData, appsData, roleData] = await Promise.all([
                get("goals"),
                get("profile"),
                get("apps"),
                get("role_access", { admin: false }),
            ]);
            const nextUsers = Array.isArray(profileData) ? profileData : [];
            const nextApps = Array.isArray(appsData) ? appsData : [];
            nextApps.sort((a, b) => (b.name || "").length - (a.name || "").length);
            setRecords(Array.isArray(goalsData) ? goalsData : []);
            setUsers(nextUsers);
            setApps(nextApps);
            setAllowedEmails(allowedEmailsFromRoleAccess(roleData));
        } catch (e) {
            console.error("Error fetching workspace goals:", e);
            setRecords([]);
        }
    }, []);

    useEffect(() => {
        const tabParam = searchParams.get("tab");
        if (tabParam && HORIZONS.includes(tabParam)) {
            setCurrentTab(tabParam);
            setTimeframe(tabParam);
            setHorizon(tabParam);
        }
        setLoading(true);
        const seen = new Set();
        const mark = (key) => {
            seen.add(key);
            if (seen.size >= 4) setLoading(false);
        };
        const unsubs = [
            watch("goals", (d) => {
                setRecords(Array.isArray(d) ? d : []);
                mark("goals");
            }, { onError: (e) => { console.error("Error fetching workspace goals:", e); setRecords([]); mark("goals"); } }),
            watch("profile", (d) => {
                setUsers(Array.isArray(d) ? d : []);
                mark("profile");
            }, { onError: () => { setUsers([]); mark("profile"); } }),
            watch("apps", (d) => {
                const nextApps = Array.isArray(d) ? d.slice() : [];
                nextApps.sort((a, b) => (b.name || "").length - (a.name || "").length);
                setApps(nextApps);
                mark("apps");
            }, { onError: () => { setApps([]); mark("apps"); } }),
            watch("role_access", (d) => {
                setAllowedEmails(allowedEmailsFromRoleAccess(d));
                mark("role_access");
            }, { admin: false, onError: () => { setAllowedEmails([]); mark("role_access"); } }),
        ];
        return () => unsubs.forEach((u) => u());
    }, [searchParams]);

    const persistGoals = async (list, { skipReload } = {}) => {
        try {
            await save("goals", stripTitles(persistableCollection(list)));
            return true;
        } catch (e) {
            console.error("Error saving goals:", e);
            if (isAdminView) {
                alert("Failed to save goals data to the server.");
            } else {
                await showAlert("Error", "Failed to save data to the server.");
            }
            return false;
        }
    };

    const closeModule = () => {
        clearActiveModule();
        router.push("/");
    };

    const openModal = (setOpen, setShown) => {
        setOpen(true);
        later(() => setShown(true), 10);
    };
    const closeModal = (setOpen, setShown, after) => {
        setShown(false);
        later(() => {
            setOpen(false);
            if (after) after();
        }, 300);
    };

    const hideTags = () => {
        setTagOpen(false);
        setTagFilter("");
        setTagSearch("");
    };

    const clearEditor = () => {
        if (editorRef.current) editorRef.current.innerHTML = "";
        hideTags();
    };

    const directory = useMemo(() => getDirectoryUsers(users, allowedEmails), [users, allowedEmails]);
    const memberOptions = useMemo(() => {
        const teammates = [...directory]
            .filter((p) => (p.email || "").trim())
            .sort((a, b) => a.email.localeCompare(b.email, undefined, { sensitivity: "base" }));
        return [
            { value: "all", label: "All users" },
            ...teammates.map((p) => {
                const email = p.email.trim().toLowerCase();
                return { value: email, label: email };
            }),
        ];
    }, [directory]);

    useEffect(() => {
        if (memberFilter === "all" || memberOptions.some((o) => o.value === memberFilter)) return;
        const t = setTimeout(() => setMemberFilter("all"), 0);
        return () => clearTimeout(t);
    }, [memberFilter, memberOptions]);

    const horizonOptions = HORIZON_OPTIONS.filter((o) => o.value !== "all");

    const filteredApps = useMemo(() => {
        const q = (tagSearch || tagFilter || "").toLowerCase();
        return apps.filter((app) => (app.name || "").toLowerCase().includes(q));
    }, [apps, tagFilter, tagSearch]);

    const insertTag = (appName) => {
        const inputEl = editorRef.current;
        if (!inputEl) return;
        const val = inputEl.textContent || "";
        const lastAtIndex = val.lastIndexOf("@");
        let newVal = val;
        if (lastAtIndex !== -1) newVal = val.substring(0, lastAtIndex) + `@${appName}`;
        inputEl.innerHTML = formatGoalTextForInput(newVal, appsRef.current) + "&nbsp;";
        placeCaretAtEnd(inputEl);
        hideTags();
    };

    const addDraftItem = async () => {
        const input = editorRef.current;
        const text = (input?.textContent || "").trim();
        if (!text) return;
        if (draftItems.length >= 15) {
            await showAlert("Validation Error", "A maximum of 15 items is allowed.");
            return;
        }
        setDraftItems((prev) => [...prev, { key: nextDraftKey(), text }]);
        if (input) input.innerHTML = "";
        hideTags();
    };

    const onEditorInput = () => {
        const val = editorRef.current?.textContent || "";
        const words = val.split(/\s+/);
        const lastWord = words[words.length - 1] || "";
        if (lastWord.startsWith("@")) {
            setTagOpen(true);
            setTagFilter(lastWord.slice(1));
        } else {
            hideTags();
        }
    };

    const onEditorKeyDown = async (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            await addDraftItem();
            return;
        }
        if (e.key === " " || e.keyCode === 32) {
            const val = editorRef.current?.textContent || "";
            const words = val.split(/\s+/);
            const lastWord = words[words.length - 1];
            if (lastWord && lastWord.startsWith("@")) {
                const typedAppName = lastWord.slice(1).toLowerCase();
                const matchedApp = appsRef.current.find((app) => (app.name || "").toLowerCase() === typedAppName);
                if (matchedApp) {
                    e.preventDefault();
                    insertTag(matchedApp.name);
                }
            }
        }
    };

    const openUnifiedNew = () => {
        setEditingId(null);
        setDraftItems([]);
        setEditingKey(null);
        clearEditor();
        if (isAdminView) {
            setScope("personal");
            const emails = directoryEmails(users);
            setAssigneeEmail(emails[0] || "");
            openModal(setUnifiedOpen, setUnifiedShown);
            return;
        }
        const nextHorizon = timeframe === "all" ? "annual" : timeframe;
        setHorizon(nextHorizon);
        setCurrentTab(nextHorizon);
        openModal(setUnifiedOpen, setUnifiedShown);
    };

    const openUnifiedEdit = (recordId) => {
        const record = records.find((r) => sameId(r.id, recordId));
        if (!record) return;
        setEditingId(record.id);
        setDraftItems((record.goals || []).map((g) => ({ key: nextDraftKey(), text: g.text })));
        setEditingKey(null);
        clearEditor();
        const type = resolveGoalType(record);
        setHorizon(type);
        setCurrentTab(type);
        if (isAdminView) {
            const scopeVal = record.scope || "personal";
            setScope(scopeVal);
            const currentEmail = goalEmail(record);
            setAssigneeEmail(currentEmail || "");
            closeModal(setViewOpen, setViewShown, () => setViewingId(null));
        }
        openModal(setUnifiedOpen, setUnifiedShown);
    };

    const closeUnified = () => {
        closeModal(setUnifiedOpen, setUnifiedShown, () => {
            setEditingId(null);
            setDraftItems([]);
            setEditingKey(null);
            clearEditor();
        });
    };

    const saveUnifiedGoal = () => runFormBusy(async () => {
        const currentActor = actorRef.current || { name: "", email: "" };
        const itemsArray = draftItems.map((d) => (editingKey === d.key ? editText : d.text).trim()).filter(Boolean);
        if (!isAdminView && !(currentActor.name || "")) {
            await showAlert("Authentication Error", "Your user session name could not be identified.");
            return;
        }
        if (itemsArray.length < 1) {
            await showAlert("Validation Error", "You must add at least 1 goal/milestone.");
            return;
        }
        if (itemsArray.length > 15) {
            await showAlert("Validation Error", "A maximum of 15 goals/milestones is allowed.");
            return;
        }

        const currentDB = cloneRecords(records);
        const userEmail = (currentActor.email || "").trim().toLowerCase();

        if (isAdminView) {
            let targetUser = currentActor.name || "Anonymous";
            let targetEmail = userEmail;
            let isAssigned = false;
            if (scope === "personal") {
                if (!assigneeEmail) {
                    await showAlert("Validation Error", "Please select a profile to assign the goal to.");
                    return;
                }
                const selectedEmail = assigneeEmail.trim().toLowerCase();
                const selectedUser = users.find((u) => (u.email || "").trim().toLowerCase() === selectedEmail);
                targetUser = selectedUser ? ((selectedUser.name || "").trim() || selectedEmail) : (profileNameForEmail(users, selectedEmail) || selectedEmail);
                targetEmail = selectedEmail;
                isAssigned = true;
            }

            if (editingId) {
                const record = currentDB.find((r) => sameId(r.id, editingId));
                if (!record) {
                    await showAlert("Error", "Goal record not found.");
                    return;
                }
                const type = resolveGoalType(record);
                const originalGoals = record.goals || [];
                const wasAssigned = !!record.assignedByAdmin;
                const previousAssigneeEmail = goalEmail(record);
                record.goals = itemsArray.map((text) => {
                    const match = originalGoals.find((og) => og.text.toLowerCase() === text.toLowerCase());
                    return { text, done: match ? match.done : false };
                });
                record.scope = scope;
                delete record.title;
                if (scope === "personal") {
                    record.user = targetUser;
                    record.email = targetEmail;
                    record.assignedByAdmin = isAssigned;
                    record.createdBy = currentActor.name;
                    record.createdByEmail = userEmail;
                } else {
                    record.user = currentActor.name;
                    record.email = userEmail;
                    delete record.assignedByAdmin;
                    delete record.createdBy;
                    delete record.createdByEmail;
                }
                const saved = await persistGoals(currentDB);
                if (!saved) return;
                const assigneeChanged = isAssigned && (!wasAssigned || previousAssigneeEmail !== targetEmail);
                if (assigneeChanged) {
                    notifyAssigneeOfGoal({
                        assigneeName: targetUser,
                        assigneeEmail: targetEmail,
                        actorName: currentActor.name,
                        goalType: type,
                        periodId: record.periodId,
                        action: wasAssigned ? "updated" : "assigned",
                    });
                }
                notifyTeam({
                    action: "updated",
                    actorName: currentActor.name,
                    itemName: `${type} goals (${record.periodId})`,
                    module: "Goals",
                    excludeEmail: currentActor.email,
                });
                closeUnified();
                return;
            }

            const periodId = computePeriodId(currentTab);
            const now = nextItemId();
            const record = {
                id: now,
                createdAt: new Date(now).toISOString(),
                user: targetUser,
                email: targetEmail,
                goals: itemsArray.map((item) => ({ text: item, done: false })),
                weekId: currentTab === "weekly" ? periodId : null,
                periodId,
                type: currentTab,
                scope,
            };
            if (isAssigned) {
                record.assignedByAdmin = true;
                record.createdBy = currentActor.name;
                record.createdByEmail = userEmail;
            }
            currentDB.push(record);
            const saved = await persistGoals(currentDB);
            if (!saved) return;
            if (isAssigned) {
                notifyAssigneeOfGoal({
                    assigneeName: targetUser,
                    assigneeEmail: targetEmail,
                    actorName: currentActor.name,
                    goalType: currentTab,
                    periodId: record.periodId,
                    action: "assigned",
                });
            }
            notifyTeam({
                action: "added",
                actorName: currentActor.name,
                itemName: `${currentTab} goals (${periodId})`,
                module: "Goals",
                excludeEmail: currentActor.email,
            });
            closeUnified();
            return;
        }

        const user = currentActor.name || "Anonymous";
        if (editingId) {
            const record = currentDB.find((r) => sameId(r.id, editingId));
            if (!record) {
                await showAlert("Error", "Goal record not found.");
                return;
            }
            let type = resolveGoalType(record);
            const originalGoals = record.goals || [];
            record.goals = itemsArray.map((text) => {
                const match = originalGoals.find((og) => og.text.toLowerCase() === text.toLowerCase());
                return { text, done: match ? match.done : false };
            });
            if (!record.scope) record.scope = "personal";
            if (userEmail) record.email = userEmail;
            if (horizon !== type) {
                const periodId = computePeriodId(horizon);
                record.type = horizon;
                record.periodId = periodId;
                record.weekId = horizon === "weekly" ? periodId : null;
            }
            delete record.title;
            const saved = await persistGoals(currentDB);
            if (!saved) return;
            notifyTeam({
                action: "updated",
                actorName: currentActor.name,
                itemName: `${record.type} goals (${record.periodId})`,
                module: "Goals",
                excludeEmail: currentActor.email,
            });
            closeUnified();
            return;
        }

        const periodId = computePeriodId(horizon);
        const now = nextItemId();
        currentDB.push({
            id: now,
            createdAt: new Date(now).toISOString(),
            user,
            email: userEmail,
            goals: itemsArray.map((item) => ({ text: item, done: false })),
            weekId: horizon === "weekly" ? periodId : null,
            periodId,
            type: horizon,
            scope: "personal",
        });
        const saved = await persistGoals(currentDB);
        if (!saved) return;
        notifyTeam({
            action: "added",
            actorName: currentActor.name,
            itemName: `${horizon} goals (${periodId})`,
            module: "Goals",
            excludeEmail: currentActor.email,
        });
        closeUnified();
    });

    const deleteWorkspaceRecord = async (id) => {
        const currentActor = actorRef.current || { name: "", email: "" };
        const data = cloneRecords(records);
        const item = data.find((r) => sameId(r.id, id));
        if (item && !actorOwns(item)) {
            await showAlert("Permission Denied", "You can only remove your own goal cards.");
            return;
        }
        const confirmed = await showConfirm("Confirm Delete", "Are you sure you want to delete this goal record?");
        if (!confirmed) return;
        const filtered = data.filter((r) => !sameId(r.id, id));
        const saved = await persistGoals(filtered);
        if (!saved) return;
        notifyTeam({
            action: "deleted",
            actorName: currentActor.name,
            itemName: item ? `goal entry matching user ${item.user}` : "a goal record",
            module: "Goals",
            excludeEmail: currentActor.email,
        });
    };

    const toggleSubGoal = async (recordId, index) => {
        const data = cloneRecords(records);
        const item = data.find((r) => sameId(r.id, recordId));
        if (!item) return;
        if (!actorOwns(item)) {
            await showAlert("Permission Denied", "You can only complete your own goals.");
            return;
        }
        if (!item.goals[index]) return;
        item.goals[index].done = !item.goals[index].done;
        setRecords(data);
        const saved = await persistGoals(data, { skipReload: true });
        if (!saved) {
            item.goals[index].done = !item.goals[index].done;
            setRecords(cloneRecords(records));
            await loadAll();
            return;
        }
    };

    const adminToggleGoal = async (recordId, goalIndex) => {
        const data = cloneRecords(records);
        const item = data.find((r) => sameId(r.id, recordId));
        if (!item) return;
        if (!actorOwns(item)) {
            alert("Permission Denied: You can only modify your own goals.");
            return;
        }
        if (!item.goals[goalIndex]) return;
        item.goals[goalIndex].done = !item.goals[goalIndex].done;
        await persistGoals(data);
    };

    const deleteAdminRecord = async (recordId) => {
        const currentActor = actorRef.current || { name: "A Team Member", email: "" };
        const data = cloneRecords(records);
        const deletedRecord = data.find((r) => sameId(r.id, recordId));
        if (deletedRecord && !actorCanManage(deletedRecord)) {
            alert("Permission Denied: You can only delete your own goals or goals you assigned.");
            return;
        }
        if (!confirm("Are you sure you want to delete this goals commitment card?")) return;
        const filtered = data.filter((r) => !sameId(r.id, recordId));
        if (sameId(viewingId, recordId)) closeModal(setViewOpen, setViewShown, () => setViewingId(null));
        const saved = await persistGoals(filtered);
        if (!saved) return;
        const deletedPeriod = deletedRecord ? (deletedRecord.periodId || deletedRecord.weekId || "Target") : "Target";
        notifyTeam({
            action: "deleted",
            actorName: currentActor.name,
            itemName: deletedRecord ? `${deletedRecord.user}'s goals (${deletedPeriod})` : "a goals record",
            module: "Goals",
            excludeEmail: currentActor.email,
        });
    };

    const approvePending = async (id) => {
        if (!confirm("Approve this goals review record?")) return;
        try {
            await approve("goals", id);
            await loadAll();
        } catch (e) {
            console.error(e);
            alert("Failed to approve goals record.");
        }
    };

    const rejectPending = async (id) => {
        if (!confirm("Reject and delete this goals review record?")) return;
        try {
            await reject("goals", id);
            await loadAll();
        } catch (e) {
            console.error(e);
            alert("Failed to reject goals record.");
        }
    };

    const handleRefresh = async () => {
        setRefreshSpin(true);
        try {
            await loadAll();
        } catch (e) {
            console.error("Refresh issue:", e);
        } finally {
            later(() => setRefreshSpin(false), 500);
        }
    };

    const q = searchQuery.toLowerCase().trim();

    const workspaceRows = useMemo(() => {
        const rows = [];
        records.forEach((record) => {
            const type = resolveGoalType(record);
            if (timeframe !== "all" && type !== timeframe) return;
            const resolvedPeriod = record.periodId || record.weekId || "Target";
            const recordEmail = goalEmail(record);
            if (memberFilter !== "all" && recordEmail !== memberFilter.toLowerCase().trim()) return;
            const userMatch = recordEmail.includes(q);
            const periodMatch = typeof resolvedPeriod === "string" && resolvedPeriod.toLowerCase().includes(q);
            const formattedPeriod = formatPeriodLabel(resolvedPeriod, type);
            const periodLabelMatch = formattedPeriod.toLowerCase().includes(q);
            const typeLabel = capitalize(type);
            const typeMatch = typeLabel.toLowerCase().includes(q);
            const goals = Array.isArray(record.goals) ? record.goals : [];
            const matchingGoals = goals.map((g, index) => ({ ...g, index })).filter((g) => {
                if (!q) return true;
                if (userMatch || periodMatch || periodLabelMatch || typeMatch) return true;
                return g && g.text && typeof g.text === "string" && g.text.toLowerCase().includes(q);
            });
            if (matchingGoals.length === 0) return;
            const isOwner = actorOwns(record);
            matchingGoals.forEach((g) => {
                rows.push({ record, goal: g, typeLabel, recordEmail, isOwner });
            });
        });
        rows.sort((a, b) => {
            const ta = getGoalCreatedTime(a.record);
            const tb = getGoalCreatedTime(b.record);
            const byTime = sortDir === "desc" ? tb - ta : ta - tb;
            if (byTime !== 0) return byTime;
            const na = Number(a.record.id);
            const nb = Number(b.record.id);
            if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) {
                return sortDir === "desc" ? nb - na : na - nb;
            }
            return (a.goal.index || 0) - (b.goal.index || 0);
        });
        return rows;
    }, [records, sortDir, timeframe, memberFilter, q, goalEmail, actorOwns]);

    const wsMaxPage = Math.max(1, Math.ceil(workspaceRows.length / WORKSPACE_ITEMS_PER_PAGE));
    const wsPage = Math.min(Math.max(1, workspacePage), wsMaxPage);
    const wsStart = (wsPage - 1) * WORKSPACE_ITEMS_PER_PAGE;
    const pageRows = workspaceRows.slice(wsStart, wsStart + WORKSPACE_ITEMS_PER_PAGE);

    const adminFiltered = useMemo(() => {
        return records.filter((record) => {
            const type = resolveGoalType(record);
            if (type !== currentTab) return false;
            const resolvedPeriod = record.periodId || record.weekId || "Target";
            const capitalizedType = capitalize(type);
            const userMatch = goalEmail(record).includes(q);
            const goalMatch = record.goals ? record.goals.some((g) => (g.text || "").toLowerCase().includes(q)) : false;
            const weekMatch = resolvedPeriod ? String(resolvedPeriod).toLowerCase().includes(q) : false;
            const typeMatch = capitalizedType ? capitalizedType.toLowerCase().includes(q) : false;
            const titleMatch = record.title ? record.title.toLowerCase().includes(q) : false;
            return userMatch || goalMatch || weekMatch || typeMatch || titleMatch;
        });
    }, [records, currentTab, q, goalEmail]);

    const adminSorted = useMemo(() => [...adminFiltered].sort((a, b) => b.id - a.id), [adminFiltered]);
    const adminMaxPage = Math.max(1, Math.ceil(adminSorted.length / ITEMS_PER_PAGE));
    const aPage = Math.min(Math.max(1, adminPage), adminMaxPage);
    const aStart = (aPage - 1) * ITEMS_PER_PAGE;
    const adminPageRows = adminSorted.slice(aStart, aStart + ITEMS_PER_PAGE);

    const leaderboard = useMemo(() => {
        const userStats = {};
        records.forEach((r) => {
            const key = goalEmail(r) || r.user || "unknown";
            if (!userStats[key]) userStats[key] = { attempted: 0, completed: 0, name: key };
            userStats[key].attempted += (r.goals || []).length;
            userStats[key].completed += (r.goals || []).filter((g) => g.done).length;
        });
        return Object.entries(userStats).sort((a, b) => b[1].completed - a[1].completed);
    }, [records, goalEmail]);

    const lbMaxPage = Math.max(1, Math.ceil(leaderboard.length / LEADERBOARD_ITEMS_PER_PAGE));
    const lPage = Math.min(Math.max(1, lbPage), lbMaxPage);
    const lbStart = (lPage - 1) * LEADERBOARD_ITEMS_PER_PAGE;
    const lbRows = leaderboard.slice(lbStart, lbStart + LEADERBOARD_ITEMS_PER_PAGE);

    const viewing = records.find((r) => sameId(r.id, viewingId));

    const openReassign = (recordId) => {
        const id = recordId || null;
        setReassigningId(id);
        const data = records;
        const emails = directoryEmails(users);
        if (id) {
            const record = data.find((r) => sameId(r.id, id));
            if (!record) {
                showAlert("Error", "Goal record not found.");
                return;
            }
            const current = goalEmail(record);
            setReassignFrom(current || "");
            setReassignTo(emails.find((e) => e !== current) || emails[0] || "");
        } else {
            const fromEmails = [...new Set([
                ...emails,
                ...data.filter(isPersonalGoalRecord).map((r) => goalEmail(r)).filter(Boolean),
            ])];
            setReassignFrom(fromEmails[0] || "");
            setReassignTo(emails[0] || "");
        }
        closeModal(setViewOpen, setViewShown, () => setViewingId(null));
        openModal(setReassignOpen, setReassignShown);
    };

    const reassignPreview = (() => {
        const toEmail = (reassignTo || "").trim().toLowerCase();
        const fromEmail = (reassignFrom || "").trim().toLowerCase();
        if (reassigningId) {
            const record = records.find((r) => sameId(r.id, reassigningId));
            const current = record ? goalEmail(record) : "";
            if (!toEmail) return "Select a user to receive this goal.";
            if (current && current === toEmail) return "This goal is already assigned to that user.";
            return current
                ? `This goal will move from ${current} to ${toEmail}.`
                : `This goal will be assigned to ${toEmail}.`;
        }
        if (!fromEmail || !toEmail) return "Select a current assignee and a new assignee.";
        if (fromEmail === toEmail) return "Choose a different user to reassign to.";
        const count = records.filter((r) => isPersonalGoalRecord(r) && recordBelongsToEmail(r, fromEmail, goalEmail)).length;
        return count === 1
            ? `1 personal goal will move from ${fromEmail} to ${toEmail}.`
            : `${count} personal goals will move from ${fromEmail} to ${toEmail}.`;
    })();

    const confirmReassignGoals = () => runFormBusy(async () => {
        const currentActor = actorRef.current || { name: "", email: "" };
        const fromEmail = (reassignFrom || "").trim().toLowerCase();
        const toEmail = (reassignTo || "").trim().toLowerCase();
        if (!toEmail) {
            await showAlert("Validation Error", "Please select a user to reassign to.");
            return;
        }
        const data = cloneRecords(records);
        let targets = [];
        if (reassigningId) {
            const record = data.find((r) => sameId(r.id, reassigningId));
            if (!record) {
                await showAlert("Error", "Goal record not found.");
                return;
            }
            if (goalEmail(record) === toEmail) {
                await showAlert("Validation Error", "This goal is already assigned to that user.");
                return;
            }
            targets = [record];
        } else {
            if (!fromEmail) {
                await showAlert("Validation Error", "Please select the user to reassign from.");
                return;
            }
            if (fromEmail === toEmail) {
                await showAlert("Validation Error", "Choose a different user to reassign to.");
                return;
            }
            targets = data.filter((r) => isPersonalGoalRecord(r) && recordBelongsToEmail(r, fromEmail, goalEmail));
            if (targets.length === 0) {
                await showAlert("No Goals", `No personal goals found for ${fromEmail}.`);
                return;
            }
        }
        const confirmed = await showConfirm(
            "Confirm Reassign",
            targets.length === 1
                ? `Reassign this goal to ${toEmail}?`
                : `Reassign ${targets.length} goals from ${fromEmail} to ${toEmail}?`
        );
        if (!confirmed) return;
        const previousEmails = new Set(targets.map((r) => goalEmail(r)).filter(Boolean));
        targets.forEach((record) => {
            record.user = profileNameForEmail(users, toEmail);
            record.email = toEmail;
            record.assignedByAdmin = true;
            record.createdBy = currentActor.name;
            record.createdByEmail = (currentActor.email || "").trim().toLowerCase();
            record.scope = "personal";
        });
        const saved = await persistGoals(data);
        if (!saved) return;
        if (!previousEmails.has(toEmail)) {
            const sample = targets[0];
            notifyAssigneeOfGoal({
                assigneeName: profileNameForEmail(users, toEmail),
                assigneeEmail: toEmail,
                actorName: currentActor.name,
                goalType: targets.length === 1 ? (sample.type || "goal") : `${targets.length} personal`,
                periodId: targets.length === 1 ? sample.periodId : "",
                action: "assigned",
            });
        }
        closeModal(setReassignOpen, setReassignShown, () => setReassigningId(null));
    });

    const assigneeOptions = useMemo(() => {
        const emails = directoryEmails(users);
        if (assigneeEmail && !emails.includes(assigneeEmail)) emails.push(assigneeEmail);
        return [...new Set(emails)].sort((a, b) => a.localeCompare(b));
    }, [users, assigneeEmail]);

    const reassignFromOptions = useMemo(() => {
        if (reassigningId) {
            const record = records.find((r) => sameId(r.id, reassigningId));
            const current = record ? goalEmail(record) : "";
            return current ? [current] : [];
        }
        return [...new Set([
            ...directoryEmails(users),
            ...records.filter(isPersonalGoalRecord).map((r) => goalEmail(r)).filter(Boolean),
        ])].sort((a, b) => a.localeCompare(b));
    }, [reassigningId, records, users, goalEmail]);

    const reassignToOptions = useMemo(() => directoryEmails(users).sort((a, b) => a.localeCompare(b)), [users]);

    const unifiedTitle = editingId ? "Edit Goal" : "New Goal";
    const adminUnifiedTitle = editingId ? `Edit ${capitalize(currentTab)} Goal` : `Set ${capitalize(currentTab)} Goal`;
    const saveBtnLabel = isAdminView && editingId ? "Save Changes" : "Commit Goal";
    const assigneeLabel = editingId ? "Reassign Goal To" : "Assign Goal To";
    const renderedRows = pageRows.map((row, idx) => {
        const firstOwnerIdx = pageRows.findIndex((r) => r.record.id === row.record.id && r.isOwner);
        return { ...row, showActions: row.isOwner && firstOwnerIdx === idx };
    });
    const viewType = viewing ? resolveGoalType(viewing) : "";
    const viewCompleted = viewing ? (viewing.goals || []).filter((g) => g.done).length : 0;
    const viewPct = viewing ? Math.round((viewCompleted / ((viewing.goals || []).length || 1)) * 100) : 0;
    const viewCanReassign = viewing ? (!viewing.pendingId && viewing.scope !== "global") : false;
    const viewCanManage = viewing ? actorCanManage(viewing) : false;

    const mentionsBlock = (
        <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "flex-start" }}>
            <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column" }}>
                <div
                    ref={editorRef}
                    className="rte-input"
                    contentEditable
                    data-placeholder="Add an item... (Type @ to tag an app)"
                    suppressContentEditableWarning
                    onInput={onEditorInput}
                    onKeyDown={onEditorKeyDown}
                />
                {tagOpen && (
                    <div style={{ display: "block", position: "absolute", top: "100%", left: 0, width: "100%", background: "#1e293b", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, zIndex: 10001, boxShadow: "0 10px 15px -3px rgba(0,0,0,0.5)", padding: 8, boxSizing: "border-box", marginTop: 4 }}>
                        <input
                            type="text"
                            placeholder="Filter applications..."
                            autoComplete="off"
                            value={tagSearch}
                            onChange={(e) => setTagSearch(e.target.value)}
                            style={{ padding: "6px 10px", fontSize: "0.8rem", background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", color: "white", marginBottom: 6, borderRadius: 4, boxSizing: "border-box", width: "100%" }}
                        />
                        <div style={{ maxHeight: 112, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
                            {filteredApps.length === 0
                                ? <span style={{ fontSize: "0.75rem", color: "#6b7280", padding: "4px 8px" }}>No apps found</span>
                                : filteredApps.map((app) => (
                                    <div key={app.id || app.name} className="app-tag-item" onClick={(e) => { e.stopPropagation(); insertTag(app.name); }}>{app.name}</div>
                                ))}
                        </div>
                    </div>
                )}
            </div>
            <button
                type="button"
                onClick={addDraftItem}
                style={{ width: "auto", background: "rgba(251, 113, 133, 0.1)", border: "1px solid rgba(251, 113, 133, 0.3)", color: ACCENT, padding: "8px 12px", borderRadius: 4, cursor: "pointer", fontSize: "0.85rem", marginBottom: 0, boxShadow: "none", height: 38 }}
            >
                <i className="fa-solid fa-plus"></i>
            </button>
        </div>
    );

    const draftList = (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, minHeight: 50, maxHeight: 220, overflowY: "auto" }}>
            {draftItems.map((item, idx) => (
                <li
                    key={item.key}
                    className="goal-item"
                    draggable
                    onDragStart={() => { dragFrom.current = idx; }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                        const from = dragFrom.current;
                        if (from == null || from === idx) return;
                        const next = draftItems.slice();
                        const [moved] = next.splice(from, 1);
                        next.splice(idx, 0, moved);
                        setDraftItems(next);
                        dragFrom.current = null;
                    }}
                >
                    <i className="fa-solid fa-grip-vertical drag-handle"></i>
                    {editingKey === item.key ? (
                        <input
                            type="text"
                            className="goal-input"
                            value={editText}
                            autoFocus
                            onChange={(e) => setEditText(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    setDraftItems((prev) => prev.map((d) => d.key === item.key ? { ...d, text: editText.trim() || d.text } : d));
                                    setEditingKey(null);
                                }
                            }}
                        />
                    ) : (
                        <GoalHtml className="goal-content" text={item.text} apps={apps} />
                    )}
                    <div className="goal-actions">
                        {editingKey === item.key ? (
                            <button
                                type="button"
                                className="goal-btn"
                                onClick={() => {
                                    setDraftItems((prev) => prev.map((d) => d.key === item.key ? { ...d, text: editText.trim() || d.text } : d));
                                    setEditingKey(null);
                                }}
                            >
                                <i className="fa-solid fa-check"></i>
                            </button>
                        ) : (
                            <button
                                type="button"
                                className="goal-btn"
                                onClick={() => {
                                    setEditingKey(item.key);
                                    setEditText(item.text);
                                }}
                            >
                                <i className="fa-solid fa-pen"></i>
                            </button>
                        )}
                        <button type="button" className="goal-btn" onClick={() => setDraftItems((prev) => prev.filter((d) => d.key !== item.key))}>
                            <i className="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </li>
            ))}
        </ul>
    );

    const validationModal = (
        <ModuleModal open={infoOpen} shown={infoShown} onBackdrop={() => closeModal(setInfoOpen, setInfoShown)}>
            <div className={`modal-content${isAdminView ? " admin-modal" : ""}`} style={{ maxWidth: 400 }}>
                <div className="modal-header">
                    <h3 style={{ margin: "0 auto", display: "flex", alignItems: "center", gap: 8, color: ACCENT }}>
                        <i className="fa-solid fa-circle-info"></i> Goal Requirements
                    </h3>
                    <span className="close-btn" onClick={() => closeModal(setInfoOpen, setInfoShown)}>&times;</span>
                </div>
                <div className="modal-body" style={{ fontSize: "0.9rem", lineHeight: 1.6, color: "#9ca3af", textAlign: "center", padding: "10px 0" }}>
                    <p style={{ margin: "0 0 16px 0" }}>To ensure precise planning and tracking, entries committed to the platform must align with the following rules:</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center", marginBottom: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "white", fontWeight: 600 }}>
                            <i className="fa-solid fa-circle-check" style={{ color: ACCENT }}></i>
                            <span>Minimum: 1 item</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "white", fontWeight: 600 }}>
                            <i className="fa-solid fa-circle-check" style={{ color: ACCENT }}></i>
                            <span>Maximum: 15 items</span>
                        </div>
                    </div>
                </div>
            </div>
        </ModuleModal>
    );

    return (
        <div className="goals-module">
            <div className="container">
                <div className="header-container" style={{ display: "grid", gridTemplateColumns: "40px 1fr auto", alignItems: "center", marginBottom: 24, borderBottom: "1px solid var(--border-color)", paddingBottom: 16 }}>
                    <div></div>
                    {isAdminView ? (
                        <h2 style={{ margin: "0 auto", borderBottom: "none", paddingBottom: 0, fontSize: "1.8rem", display: "flex", alignItems: "center", gap: 10 }}>
                            Goals
                            <IconBtn title="About this module" onClick={() => openModal(setAboutOpen, setAboutShown)} style={{ width: "auto", fontSize: "1rem" }} hoverScale={1.15}>
                                <i className="fa-solid fa-circle-info"></i>
                            </IconBtn>
                        </h2>
                    ) : (
                        <h2 style={{ margin: "0 auto", borderBottom: "none", paddingBottom: 0, fontSize: "1.8rem", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                            <span>Goals</span>
                        </h2>
                    )}
                    <div className="header-actions-right" style={{ display: "flex", alignItems: "center", gap: 4, justifySelf: "end" }}>
                        {!isAdminView && (
                            <IconBtn className="refresh-btn" title="Refresh entries" onClick={handleRefresh}>
                                <i className={`fa-solid fa-arrows-rotate${refreshSpin ? " fa-spin" : ""}`}></i>
                            </IconBtn>
                        )}
                        <IconBtn className="close-module-btn" title="Close module" onClick={closeModule}>
                            <i className="fa-solid fa-xmark"></i>
                        </IconBtn>
                    </div>
                </div>

                {isAdminView ? (
                    <>
                        <div className="header-actions" style={{ marginBottom: 24, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                            <div className="search-input-wrapper" style={{ flex: 1 }}>
                                <input type="text" placeholder="Search keyword..." value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setAdminPage(1); }} />
                            </div>
                            <div className="header-actions-tools">
                                <button type="button" className="header-actions-icon-btn" onClick={() => openModal(setLbOpen, setLbShown)} style={{ width: "auto", padding: "10px 18px", fontSize: "0.9rem", background: ACCENT, borderColor: ACCENT, color: "white" }} title="View Leaderboard">
                                    <i className="fa-solid fa-trophy"></i>
                                </button>
                                <button type="button" onClick={() => openReassign(null)} style={{ width: "auto", padding: "10px 18px", fontSize: "0.9rem", background: ACCENT, borderColor: ACCENT, color: "white" }} title="Reassign goals to another user">
                                    <i className="fa-solid fa-user-pen"></i> Reassign
                                </button>
                            </div>
                            <div className="header-actions-primary">
                                <button type="button" onClick={openUnifiedNew} style={{ width: "auto", padding: "10px 18px", fontSize: "0.9rem", background: ACCENT, borderColor: ACCENT, color: "white" }}>
                                    <i className="fa-solid fa-plus"></i> New {capitalize(currentTab)} Goal
                                </button>
                            </div>
                        </div>
                        <div style={{ borderBottom: "1px solid var(--border-color)", marginBottom: 24 }}>
                            <div className="tabs-container" style={{ borderBottom: "none", marginBottom: 0, display: "flex", flexWrap: "wrap", gap: 4 }}>
                                {HORIZONS.map((tab) => (
                                    <button key={tab} type="button" className={`tab-btn${currentTab === tab ? " active" : ""}`} onClick={() => { setCurrentTab(tab); setAdminPage(1); }}>
                                        {capitalize(tab)}
                                    </button>
                                ))}
                            </div>
                        </div>
                        {loading ? <AdminSkeleton /> : (
                            <div>
                                <div className="goalsHistory list-container" style={{ marginBottom: 12 }}>
                                    {adminSorted.length === 0 ? (
                                        <div className="empty-state" style={{ gridColumn: "1 / -1" }}>
                                            <p>{q ? "No commitments match your search query." : "No goals logged yet. Click \"New Goals\" to get started."}</p>
                                        </div>
                                    ) : adminPageRows.map((record) => {
                                        const type = resolveGoalType(record);
                                        const capitalizedType = capitalize(type);
                                        const displayTitle = (record.title && record.title.trim()) ? formatGoalText(record.title, apps) : capitalizedType;
                                        const totalGoalsCount = record.goals.length || 1;
                                        const completedCount = record.goals.filter((g) => g.done).length;
                                        const pct = Math.round((completedCount / totalGoalsCount) * 100);
                                        const isOwner = actorCanManage(record);
                                        return (
                                            <div
                                                key={record.pendingId || record.id}
                                                className="card accordion-card"
                                                style={{ cursor: "pointer", border: "1px solid rgba(255, 255, 255, 0.05)", transition: "all 0.2s ease" }}
                                                onClick={() => { setViewingId(record.id); openModal(setViewOpen, setViewShown); }}
                                            >
                                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                                                    <h4 style={{ margin: 0, color: "white", fontSize: "0.95rem", fontWeight: 600 }} dangerouslySetInnerHTML={{ __html: displayTitle }} />
                                                    <div style={{ display: "flex", alignItems: "center", gap: 4 }} onClick={(e) => e.stopPropagation()}>
                                                        {record.pendingId && (
                                                            <>
                                                                <button type="button" className="secondary-btn" style={{ padding: "4px 8px", fontSize: "0.7rem", width: "auto", borderRadius: 4, background: "rgba(16, 185, 129, 0.15)", color: "#10b981", border: "1px solid rgba(16, 185, 129, 0.2)", marginBottom: 0 }} onClick={() => approvePending(record.pendingId)}>Approve</button>
                                                                <button type="button" className="secondary-btn" style={{ padding: "4px 8px", fontSize: "0.7rem", width: "auto", borderRadius: 4, background: "rgba(239, 68, 68, 0.15)", color: "#ef4444", border: "1px solid rgba(239, 68, 68, 0.2)", marginBottom: 0 }} onClick={() => rejectPending(record.pendingId)}>Reject</button>
                                                            </>
                                                        )}
                                                        {!record.pendingId && record.scope !== "global" && (
                                                            <button type="button" className="secondary-btn" title="Reassign to another user" style={{ padding: "2px 6px", fontSize: "0.7rem", width: "auto", borderRadius: 4, background: "rgba(251,113,133,0.1)", color: ACCENT, marginBottom: 0 }} onClick={() => openReassign(record.id)}>
                                                                <i className="fa-solid fa-user-pen"></i>
                                                            </button>
                                                        )}
                                                        {isOwner && (
                                                            <ItemMenu
                                                                items={[
                                                                    { label: "Edit", onClick: () => openUnifiedEdit(record.id) },
                                                                    { label: "Delete", onClick: () => deleteAdminRecord(record.id), danger: true },
                                                                ]}
                                                            />
                                                        )}
                                                    </div>
                                                </div>
                                                <p style={{ fontSize: "0.75rem", color: "#9ca3af", margin: "0 0 10px 0", display: "flex", alignItems: "center", gap: 4 }}>
                                                    <span>{capitalizedType} • {goalEmail(record) || "Unknown"}</span>
                                                    {record.pendingId && (
                                                        record.pendingType === "goals_completed"
                                                            ? <span style={{ background: "rgba(16, 185, 129, 0.15)", color: "#10b981", padding: "1px 4px", borderRadius: 4, fontSize: "0.65rem", fontWeight: "bold", marginLeft: 6 }}>Completed 5 Goals</span>
                                                            : <span style={{ background: "rgba(245, 158, 11, 0.15)", color: "#f59e0b", padding: "1px 4px", borderRadius: 4, fontSize: "0.65rem", fontWeight: "bold", marginLeft: 6 }}>Pending Global</span>
                                                    )}
                                                </p>
                                                <div className="infographics-bar" style={{ height: 6, margin: "10px 0" }}>
                                                    <div className="infographics-fill" style={{ width: `${pct}%` }}></div>
                                                </div>
                                                <p style={{ fontSize: "0.75rem", color: "#9ca3af", margin: 0 }}>{completedCount}/{record.goals.length} metrics reached ({pct}%)</p>
                                            </div>
                                        );
                                    })}
                                </div>
                                {adminSorted.length > 0 && (
                                    <PaginationBar
                                        start={aStart + 1}
                                        end={Math.min(aStart + ITEMS_PER_PAGE, adminSorted.length)}
                                        total={adminSorted.length}
                                        prevDisabled={aPage === 1}
                                        nextDisabled={aStart + ITEMS_PER_PAGE >= adminSorted.length}
                                        onPrev={() => setAdminPage((p) => p - 1)}
                                        onNext={() => setAdminPage((p) => p + 1)}
                                    />
                                )}
                            </div>
                        )}
                    </>
                ) : (
                    <>
                        <div className="workspace-toolbar">
                            <div className="search-input-wrapper">
                                <input type="text" placeholder="Search keyword..." value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setWorkspacePage(1); }} />
                            </div>
                            <div className="workspace-toolbar-filters">
                                <button
                                    type="button"
                                    className="sort-created-btn"
                                    title={sortDir === "desc" ? "Newest first" : "Oldest first"}
                                    onClick={() => { setSortDir((d) => d === "desc" ? "asc" : "desc"); setWorkspacePage(1); }}
                                >
                                    <i className={`fa-solid ${sortDir === "desc" ? "fa-arrow-down-wide-short" : "fa-arrow-up-wide-short"}`}></i>
                                </button>
                                <WorkspaceSelect title="Filter by timeframe" value={timeframe} options={HORIZON_OPTIONS} onChange={(v) => { setTimeframe(v); setWorkspacePage(1); }} />
                                <WorkspaceSelect title="Filter by team member" value={memberFilter} options={memberOptions} onChange={(v) => { setMemberFilter(v); setWorkspacePage(1); }} />
                            </div>
                            <button type="button" className="add-goal-btn" onClick={openUnifiedNew}>
                                <i className="fa-solid fa-plus"></i> New Goal
                            </button>
                        </div>
                        {loading ? <WorkspaceSkeleton /> : (
                            <>
                                <div className="goals-grid">
                                    {workspaceRows.length === 0 ? (
                                        <div className="empty-state"><p>No goals mapped to current workspace filter.</p></div>
                                    ) : renderedRows.map(({ record, goal: g, typeLabel, recordEmail, showActions, isOwner }) => {
                                        const createdStamp = formatGoalCreatedStamp(record);
                                        return (
                                            <div key={`${record.id}-${g.index}`} className={`workspace-goal-row${showActions ? " has-visible-actions" : ""}`}>
                                                <input
                                                    type="checkbox"
                                                    className="goal-checkbox"
                                                    checked={!!g.done}
                                                    disabled={!isOwner}
                                                    onChange={() => toggleSubGoal(record.id, g.index)}
                                                />
                                                <div className="workspace-goal-body">
                                                    <GoalHtml
                                                        className="workspace-goal-text"
                                                        text={g.text}
                                                        apps={apps}
                                                        as="div"
                                                        style={{ textDecoration: g.done ? "line-through" : "none", color: g.done ? "#6b7280" : "#d1d5db" }}
                                                    />
                                                    <div className="workspace-goal-footer">
                                                        <span className="workspace-goal-footer-meta">{typeLabel} • {recordEmail || "Unknown"}</span>
                                                    </div>
                                                </div>
                                                {showActions ? (
                                                    <div className="workspace-goal-aside">
                                                        <div className="workspace-goal-actions">
                                                            <ItemMenu
                                                                items={[
                                                                    { label: "Edit", onClick: () => openUnifiedEdit(record.id) },
                                                                    { label: "Delete", onClick: () => deleteWorkspaceRecord(record.id), danger: true },
                                                                ]}
                                                            />
                                                        </div>
                                                        {createdStamp.time ? (
                                                            <div className="goal-created-stamp" title={`Created ${createdStamp.time} ${createdStamp.date}`}>
                                                                <span className="goal-created-time">{createdStamp.time}</span>
                                                                <span className="goal-created-date">{createdStamp.date}</span>
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                ) : createdStamp.time ? (
                                                    <div className="goal-created-stamp is-overlay" title={`Created ${createdStamp.time} ${createdStamp.date}`}>
                                                        <span className="goal-created-time">{createdStamp.time}</span>
                                                        <span className="goal-created-date">{createdStamp.date}</span>
                                                    </div>
                                                ) : null}
                                            </div>
                                        );
                                    })}
                                </div>
                                {workspaceRows.length > 0 && (
                                    <PaginationBar
                                        compact
                                        start={wsStart + 1}
                                        end={Math.min(wsStart + WORKSPACE_ITEMS_PER_PAGE, workspaceRows.length)}
                                        total={workspaceRows.length}
                                        prevDisabled={wsPage === 1}
                                        nextDisabled={wsStart + WORKSPACE_ITEMS_PER_PAGE >= workspaceRows.length}
                                        onPrev={() => setWorkspacePage((p) => p - 1)}
                                        onNext={() => setWorkspacePage((p) => p + 1)}
                                    />
                                )}
                            </>
                        )}
                    </>
                )}
            </div>

            <ModuleModal open={unifiedOpen} shown={unifiedShown} onBackdrop={closeUnified}>
                <div className={`modal-content${isAdminView ? " admin-modal" : ""}`}>
                    <div className="modal-header">
                        <h3 style={{ margin: "0 auto", color: ACCENT }}>{isAdminView ? adminUnifiedTitle : unifiedTitle}</h3>
                        <span className="close-btn" onClick={closeUnified}>&times;</span>
                    </div>
                    <div className="modal-body">
                        {!isAdminView && (
                            <>
                                <label htmlFor="goalHorizonSelect" style={{ fontSize: "0.85rem", color: "#9ca3af", display: "block", marginBottom: 6 }}>Goal Horizon</label>
                                <WorkspaceSelect full value={horizon} options={horizonOptions} onChange={(v) => { setHorizon(v); setCurrentTab(v); }} />
                            </>
                        )}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                            <label style={{ fontSize: "0.85rem", color: "#9ca3af", marginBottom: 0 }}>{itemsLabelForType(isAdminView ? currentTab : horizon)}</label>
                            <IconBtn title="View goal requirements" onClick={() => openModal(setInfoOpen, setInfoShown)} style={{ width: "auto", fontSize: "0.95rem", opacity: 0.8 }} hoverScale={1.15}>
                                <i className="fa-solid fa-circle-info"></i>
                            </IconBtn>
                        </div>
                        {mentionsBlock}
                        {draftList}
                        {isAdminView && (
                            <>
                                <div style={{ marginTop: 16, display: "flex", justifyContent: "center", alignItems: "center", gap: 24 }}>
                                    <label style={{ display: "flex", alignItems: "center", gap: 8, color: "white", fontSize: "0.85rem", cursor: "pointer", marginBottom: 0 }}>
                                        <input type="radio" name="goalScope" value="personal" checked={scope === "personal"} onChange={() => setScope("personal")} style={{ accentColor: ACCENT, width: 16, height: 16, marginBottom: 0 }} />
                                        <span>Personal</span>
                                    </label>
                                    <label style={{ display: "flex", alignItems: "center", gap: 8, color: "white", fontSize: "0.85rem", cursor: "pointer", marginBottom: 0 }}>
                                        <input type="radio" name="goalScope" value="global" checked={scope === "global"} onChange={() => setScope("global")} style={{ accentColor: ACCENT, width: 16, height: 16, marginBottom: 0 }} />
                                        <span>Global</span>
                                    </label>
                                </div>
                                {scope === "personal" && (
                                    <div style={{ marginTop: 16 }}>
                                        <label htmlFor="assigneeSelect" style={{ fontSize: "0.85rem", color: "#9ca3af", display: "block", marginBottom: 6 }}>{assigneeLabel}</label>
                                        <select id="assigneeSelect" value={assigneeEmail} onChange={(e) => setAssigneeEmail(e.target.value)} style={{ padding: "8px 12px", fontSize: "0.85rem", background: "#0f172a", border: "1px solid rgba(255, 255, 255, 0.1)", color: "white", borderRadius: 4, width: "100%" }}>
                                            {assigneeOptions.length === 0
                                                ? <option value="">No users loaded</option>
                                                : assigneeOptions.map((email) => <option key={email} value={email}>{email}</option>)}
                                        </select>
                                    </div>
                                )}
                            </>
                        )}
                        <BusyButton type="button" busy={formBusy} busyLabel="Saving…" onClick={saveUnifiedGoal} style={{ marginTop: 20, background: ACCENT, borderColor: ACCENT, fontWeight: 600, width: "100%" }}>
                            {saveBtnLabel}
                        </BusyButton>
                    </div>
                </div>
            </ModuleModal>

            {validationModal}

            <ModuleModal open={aboutOpen} shown={aboutShown} onBackdrop={() => closeModal(setAboutOpen, setAboutShown)}>
                <div className="modal-content admin-modal">
                    <div className="modal-header">
                        <h3 style={{ margin: "0 auto", display: "flex", alignItems: "center", gap: 8 }}>
                            <i className="fa-solid fa-circle-info" style={{ color: ACCENT }}></i> Weekly Goals
                        </h3>
                        <span className="close-btn" onClick={() => closeModal(setAboutOpen, setAboutShown)}>&times;</span>
                    </div>
                    <div className="modal-body" style={{ fontSize: "0.93rem", lineHeight: 1.65, color: "#9ca3af" }}>
                        <div style={{ marginBottom: 20 }}>
                            <h4 style={{ color: ACCENT, margin: "0 0 8px 0", fontSize: "1rem", display: "flex", alignItems: "center", gap: 7 }}><i className="fa-solid fa-bullseye"></i> About this Module</h4>
                            <p style={{ margin: 0 }}>A weekly objectives planner designed to align team performance and track execution progress. Each team member commits exactly 5 goals at the start of every week.</p>
                        </div>
                        <div>
                            <h4 style={{ color: ACCENT, margin: "0 0 10px 0", fontSize: "1rem", display: "flex", alignItems: "center", gap: 7 }}><i className="fa-solid fa-list-check"></i> Key Actions</h4>
                            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 9 }}>
                                <li style={{ display: "flex", alignItems: "flex-start", gap: 8 }}><i className="fa-solid fa-circle-check" style={{ color: ACCENT, marginTop: 3, flexShrink: 0 }}></i><span>Set exactly 5 personal goals for the current week.</span></li>
                                <li style={{ display: "flex", alignItems: "flex-start", gap: 8 }}><i className="fa-solid fa-circle-check" style={{ color: ACCENT, marginTop: 3, flexShrink: 0 }}></i><span>Check off completed goals to update your progress bar.</span></li>
                                <li style={{ display: "flex", alignItems: "flex-start", gap: 8 }}><i className="fa-solid fa-circle-check" style={{ color: ACCENT, marginTop: 3, flexShrink: 0 }}></i><span>Search and review team commitments by user or week.</span></li>
                                <li style={{ display: "flex", alignItems: "flex-start", gap: 8 }}><i className="fa-solid fa-circle-check" style={{ color: ACCENT, marginTop: 3, flexShrink: 0 }}></i><span>View the leaderboard to see the top-performing teammates.</span></li>
                            </ul>
                        </div>
                    </div>
                </div>
            </ModuleModal>

            <ModuleModal open={lbOpen} shown={lbShown} onBackdrop={() => closeModal(setLbOpen, setLbShown)}>
                <div className="modal-content admin-modal">
                    <div className="modal-header">
                        <h3 style={{ margin: "0 auto", color: ACCENT }}> Leaderboard</h3>
                        <span className="close-btn" onClick={() => closeModal(setLbOpen, setLbShown)}>&times;</span>
                    </div>
                    <div className="modal-body">
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {leaderboard.length === 0 ? (
                                <p style={{ fontSize: "0.9rem", color: "#6b7280", fontStyle: "italic", margin: 0, textAlign: "center" }}>No data logged</p>
                            ) : lbRows.map(([username, stats], relativeIdx) => {
                                const absoluteIdx = lbStart + relativeIdx;
                                const pct = Math.round((stats.completed / stats.attempted) * 100 || 0);
                                const rankBadge = absoluteIdx > 2
                                    ? <span style={{ color: "#6b7280", fontWeight: "bold", fontSize: "0.9rem", width: 16, textAlign: "center", display: "inline-block" }}>{absoluteIdx + 1}</span>
                                    : null;
                                return (
                                    <div key={username} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "rgba(0,0,0,0.15)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.03)" }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                            {rankBadge}
                                            <strong style={{ color: "white", fontSize: "0.95rem" }}>{stats.name || username}</strong>
                                        </div>
                                        <div style={{ textAlign: "right" }}>
                                            <div style={{ fontSize: "0.9rem", fontWeight: 600, color: "#10b981" }}>{pct}% Met</div>
                                            <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>{stats.completed}/{stats.attempted} goals</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        {leaderboard.length > 0 && (
                            <PaginationBar
                                start={lbStart + 1}
                                end={Math.min(lbStart + LEADERBOARD_ITEMS_PER_PAGE, leaderboard.length)}
                                total={leaderboard.length}
                                prevDisabled={lPage === 1}
                                nextDisabled={lbStart + LEADERBOARD_ITEMS_PER_PAGE >= leaderboard.length}
                                onPrev={() => setLbPage((p) => p - 1)}
                                onNext={() => setLbPage((p) => p + 1)}
                            />
                        )}
                    </div>
                </div>
            </ModuleModal>

            <ModuleModal open={viewOpen} shown={viewShown} onBackdrop={() => closeModal(setViewOpen, setViewShown, () => setViewingId(null))}>
                <div className="modal-content admin-modal">
                    <div className="modal-header">
                        <h3 style={{ margin: "0 auto", color: ACCENT }}> {viewing ? `${goalEmail(viewing) || "Unknown"}'s Goals` : " Weekly Goals"}</h3>
                        <span className="close-btn" onClick={() => closeModal(setViewOpen, setViewShown, () => setViewingId(null))}>&times;</span>
                    </div>
                    <div className="modal-body">
                        {viewing && (
                            <>
                                <div style={{ marginBottom: 12 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", color: "#cbd5e1", marginBottom: 6, alignItems: "center" }}>
                                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                            <span>{capitalize(viewType)} • {goalEmail(viewing) || "Unknown"}</span>
                                            {viewing.pendingId && (
                                                viewing.pendingType === "goals_completed"
                                                    ? <span style={{ background: "rgba(16, 185, 129, 0.15)", color: "#10b981", padding: "1px 4px", borderRadius: 4, fontSize: "0.65rem", fontWeight: "bold", marginLeft: 6 }}>Completed 5 Goals</span>
                                                    : <span style={{ background: "rgba(245, 158, 11, 0.15)", color: "#f59e0b", padding: "1px 4px", borderRadius: 4, fontSize: "0.65rem", fontWeight: "bold", marginLeft: 6 }}>Pending Global</span>
                                            )}
                                        </span>
                                        <span><strong>{viewCompleted} of {(viewing.goals || []).length} completed ({viewPct}%)</strong></span>
                                    </div>
                                    {viewing.title ? <div style={{ fontSize: "0.9rem", color: "#cbd5e1", fontWeight: 500, marginBottom: 8 }} dangerouslySetInnerHTML={{ __html: formatGoalText(viewing.title, apps) }} /> : null}
                                    <div className="infographics-bar" style={{ margin: "4px 0", height: 8 }}>
                                        <div className="infographics-fill" style={{ width: `${viewPct}%` }}></div>
                                    </div>
                                    {viewCanReassign && (
                                        <button type="button" className="secondary-btn" title="Reassign to another user" style={{ padding: "4px 8px", fontSize: "0.75rem", width: "auto", borderRadius: 4, background: "rgba(251,113,133,0.1)", color: ACCENT, margin: "8px 0 0 0" }} onClick={() => openReassign(viewing.id)}>
                                            <i className="fa-solid fa-user-pen"></i> Reassign
                                        </button>
                                    )}
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                    {(viewing.goals || []).map((g, idx) => (
                                        <div key={idx} className="goal-item-row" style={{ marginBottom: 4, padding: "10px 12px", display: "flex", alignItems: "center" }}>
                                            <input
                                                type="checkbox"
                                                className="goal-checkbox compact"
                                                style={{ width: 16, height: 16, marginRight: 12 }}
                                                checked={!!g.done}
                                                disabled={!viewCanManage}
                                                onChange={() => adminToggleGoal(viewing.id, idx)}
                                            />
                                            <GoalHtml as="span" text={g.text} apps={apps} style={{ fontSize: "0.9rem", transition: "all 0.2s", textDecoration: g.done ? "line-through" : "none", color: g.done ? "#6b7280" : "#d1d5db" }} />
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </ModuleModal>

            <ModuleModal open={reassignOpen} shown={reassignShown} onBackdrop={() => closeModal(setReassignOpen, setReassignShown, () => setReassigningId(null))}>
                <div className="modal-content admin-modal" style={{ maxWidth: 420 }}>
                    <div className="modal-header">
                        <h3 style={{ margin: "0 auto", color: ACCENT }}>{reassigningId ? "Reassign Goal" : "Reassign Goals"}</h3>
                        <span className="close-btn" onClick={() => closeModal(setReassignOpen, setReassignShown, () => setReassigningId(null))}>&times;</span>
                    </div>
                    <div className="modal-body">
                        {!reassigningId && (
                            <div style={{ marginBottom: 14 }}>
                                <label htmlFor="reassignFromSelect" style={{ fontSize: "0.85rem", color: "#9ca3af", display: "block", marginBottom: 6 }}>From</label>
                                <select id="reassignFromSelect" value={reassignFrom} onChange={(e) => setReassignFrom(e.target.value)} style={{ padding: "8px 12px", fontSize: "0.85rem", background: "#0f172a", border: "1px solid rgba(255, 255, 255, 0.1)", color: "white", borderRadius: 4, width: "100%" }}>
                                    {reassignFromOptions.map((email) => <option key={email} value={email}>{email}</option>)}
                                </select>
                            </div>
                        )}
                        <div style={{ marginBottom: 14 }}>
                            <label htmlFor="reassignToSelect" style={{ fontSize: "0.85rem", color: "#9ca3af", display: "block", marginBottom: 6 }}>To</label>
                            <select id="reassignToSelect" value={reassignTo} onChange={(e) => setReassignTo(e.target.value)} style={{ padding: "8px 12px", fontSize: "0.85rem", background: "#0f172a", border: "1px solid rgba(255, 255, 255, 0.1)", color: "white", borderRadius: 4, width: "100%" }}>
                                {reassignToOptions.length === 0
                                    ? <option value="">No users loaded</option>
                                    : reassignToOptions.map((email) => <option key={email} value={email}>{email}</option>)}
                            </select>
                        </div>
                        <p style={{ fontSize: "0.85rem", color: "#cbd5e1", lineHeight: 1.5, margin: "0 0 16px 0" }}>{reassignPreview}</p>
                        <BusyButton type="button" busy={formBusy} busyLabel="Reassigning…" onClick={confirmReassignGoals} style={{ background: ACCENT, borderColor: ACCENT, fontWeight: 600, width: "100%", marginBottom: 0 }}>
                            Reassign
                        </BusyButton>
                    </div>
                </div>
            </ModuleModal>

            {dialog && (
                <div className={`custom-dialog-overlay${dialogShown ? " show" : ""}`}>
                    <div className="custom-dialog-box">
                        <div className="custom-dialog-header">
                            {dialog.kind === "confirm"
                                ? <i className="fa-solid fa-circle-question custom-dialog-icon" style={{ color: ACCENT }}></i>
                                : <i className="fa-solid fa-triangle-exclamation custom-dialog-icon"></i>}
                            <h4 className="custom-dialog-title">{dialog.title}</h4>
                        </div>
                        <div className="custom-dialog-body">{dialog.message}</div>
                        <div className="custom-dialog-footer">
                            {dialog.kind === "confirm" && (
                                <button type="button" className="custom-dialog-btn custom-dialog-btn-secondary" onClick={() => closeDialog(false)}>Cancel</button>
                            )}
                            <button type="button" className="custom-dialog-btn custom-dialog-btn-primary" onClick={() => closeDialog(dialog.kind === "confirm" ? true : undefined)}>
                                {dialog.kind === "confirm" ? "Yes" : "OK"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
