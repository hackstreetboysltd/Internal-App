'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { get, GoalUser, save } from "@/lib/portalApi";
import { notifyTeam } from "@/lib/emailNotify";
import { useSession, clearActiveModule } from "@/lib/session";
import RteEditor from "../apps/RteEditor";
import { escapeHtml, getEditorHtml, sanitizeHtml, stripHtml } from "../apps/html";
import {
    CHANNELS,
    DEFAULT_CHANNEL,
    DECRYPT_INVALID,
    DECRYPT_MISMATCH,
    DIRECT_CHANNEL,
    LOCKED_PLACEHOLDER,
    NOT_ADDRESSED,
    channelMeta,
    clearWrapKeyCache,
    decryptMessage,
    encryptDirectEnvelope,
    encryptEnvelope,
    getVaultPassphrase,
    isEnvelopeMessage,
    loadIdentity,
    messageChannel,
    normalizeChannel,
    setVaultPassphrase,
} from "./crypto";
import {
    ITEMS_PER_PAGE,
    cloneMessages,
    formatMessageCreatedStamp,
    getMessageCreatedTime,
    messageEmail,
    nextItemId,
    persistableCollection,
    sameId,
} from "./messagesHelpers";

const ACCENT = "#34d399";
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

function PasswordField({ value, onChange, placeholder, show, onToggle, inputStyle, onEnter }) {
    return (
        <div className="password-field">
            <input
                type={show ? "text" : "password"}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter" && onEnter) {
                        e.preventDefault();
                        onEnter();
                    }
                }}
                placeholder={placeholder}
                autoComplete="off"
                style={inputStyle}
            />
            <button
                type="button"
                className="password-toggle"
                title={show ? "Hide encryption key" : "Show encryption key"}
                aria-label={show ? "Hide encryption key" : "Show encryption key"}
                onClick={onToggle}
            >
                <i className={`fa-solid ${show ? "fa-eye-slash" : "fa-eye"}`}></i>
            </button>
        </div>
    );
}

function PaginationBar({ start, end, total, prevDisabled, nextDisabled, onPrev, onNext }) {
    return (
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12, marginTop: 16, fontSize: "0.85rem", color: "#9ca3af", fontWeight: 500 }}>
            <span>{start}-{end} of {total}</span>
            <div style={{ display: "flex", gap: 6 }}>
                <button type="button" onClick={onPrev} disabled={prevDisabled} style={{ width: "auto", padding: "4px 8px", fontSize: "0.8rem", background: prevDisabled ? "rgba(255,255,255,0.05)" : ACCENT, border: "none", color: prevDisabled ? "#4b5563" : "#111827", cursor: prevDisabled ? "not-allowed" : "pointer", borderRadius: 4, fontWeight: "bold" }}>
                    <i className="fa-solid fa-chevron-left"></i>
                </button>
                <button type="button" onClick={onNext} disabled={nextDisabled} style={{ width: "auto", padding: "4px 8px", fontSize: "0.8rem", background: nextDisabled ? "rgba(255,255,255,0.05)" : ACCENT, border: "none", color: nextDisabled ? "#4b5563" : "#111827", cursor: nextDisabled ? "not-allowed" : "pointer", borderRadius: 4, fontWeight: "bold" }}>
                    <i className="fa-solid fa-chevron-right"></i>
                </button>
            </div>
        </div>
    );
}

function MessagesSkeleton() {
    return (
        <div className="module-skeleton-grid" aria-busy="true" aria-label="Loading messages">
            {[0, 1, 2, 3, 4, 5].map((i) => (
                <div className="skel-compact-card has-accent accent-green" key={i}>
                    <div className="skel-compact-top">
                        <span className="skel-line w55"></span>
                        <div className="skel-btn-pair"><span className="skel-btn"></span><span className="skel-btn"></span></div>
                    </div>
                    <div className="skel-compact-meta"><span className="skel-line sm w40"></span></div>
                </div>
            ))}
        </div>
    );
}

function readPskUnlocked() {
    const next = {};
    CHANNELS.forEach((c) => {
        if (c.id !== DIRECT_CHANNEL) next[c.id] = !!getVaultPassphrase(c.id);
    });
    return next;
}

function RecipientPicker({ users, actorEmail, identityPub, selected, onToggle }) {
    const list = (users || []).filter((u) => (u.email || "").trim());
    if (!list.length) {
        return <div className="recipient-list"><p className="recipient-empty">No teammates found.</p></div>;
    }
    return (
        <div className="recipient-list">
            {list.map((u) => {
                const email = (u.email || "").trim().toLowerCase();
                const isMe = email === actorEmail;
                const hasKey = !!u.msgPub || (isMe && !!identityPub) || isMe;
                const checked = isMe || !!selected[email];
                return (
                    <label key={email} className={`recipient-row${hasKey ? "" : " is-disabled"}`}>
                        <input
                            type="checkbox"
                            value={email}
                            checked={checked}
                            disabled={isMe || !hasKey}
                            onChange={() => onToggle(email)}
                        />
                        <span className="recipient-name">{u.name || email}</span>
                        <span className="recipient-email">{email}</span>
                        {hasKey ? null : <span className="recipient-missing">no device key</span>}
                    </label>
                );
            })}
        </div>
    );
}

async function publishMessagePublicKey(publicJwk, email, setUsers) {
    const key = (email || "").trim().toLowerCase();
    if (!key || !publicJwk) return;
    try {
        const list = await get("profile", { admin: false });
        if (!Array.isArray(list)) return;
        const idx = list.findIndex((p) => (p.email || "").trim().toLowerCase() === key);
        if (idx === -1) return;
        const existing = list[idx].msgPub;
        if (existing && existing.x === publicJwk.x && existing.y === publicJwk.y) return;
        const next = list.slice();
        next[idx] = { ...next[idx], msgPub: publicJwk };
        await save("profile", next, { admin: false });
        setUsers((prev) => prev.map((p) => (
            (p.email || "").trim().toLowerCase() === key ? { ...p, msgPub: publicJwk } : p
        )));
    } catch (e) {
        console.warn("Could not publish message public key:", e);
    }
}

export default function MessagesClient() {
    const router = useRouter();
    const { actor } = useSession();
    const actorRef = useRef(actor);
    useEffect(() => { actorRef.current = actor; }, [actor]);

    const composeEditorRef = useRef(null);
    const editEditorRef = useRef(null);
    const timers = useRef([]);
    const later = (fn, ms) => {
        const id = setTimeout(fn, ms);
        timers.current.push(id);
        return id;
    };
    useEffect(() => () => timers.current.forEach(clearTimeout), []);

    const [loading, setLoading] = useState(true);
    const [messages, setMessages] = useState([]);
    const [users, setUsers] = useState([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [activeChannel, setActiveChannel] = useState(DEFAULT_CHANNEL);
    const [currentPage, setCurrentPage] = useState(1);
    const [vaultTick, setVaultTick] = useState(0);
    const [pskUnlocked, setPskUnlocked] = useState({});
    const [identityReady, setIdentityReady] = useState(false);
    const [identityPub, setIdentityPub] = useState(null);
    const [unlocking, setUnlocking] = useState(false);
    const [refreshSpin, setRefreshSpin] = useState(false);
    const [decoded, setDecoded] = useState({});

    const [vaultKey, setVaultKey] = useState("");
    const [vaultShow, setVaultShow] = useState(false);

    const [composeOpen, setComposeOpen] = useState(false);
    const [composeShown, setComposeShown] = useState(false);
    const [composeChannel, setComposeChannel] = useState(DEFAULT_CHANNEL);
    const [composeKey, setComposeKey] = useState("");
    const [composeKeyShow, setComposeKeyShow] = useState(false);
    const [composeSeed, setComposeSeed] = useState(0);
    const [composeSelected, setComposeSelected] = useState({});

    const [editOpen, setEditOpen] = useState(false);
    const [editShown, setEditShown] = useState(false);
    const [editId, setEditId] = useState(null);
    const [editChannel, setEditChannel] = useState(DEFAULT_CHANNEL);
    const [editKey, setEditKey] = useState("");
    const [editKeyShow, setEditKeyShow] = useState(false);
    const [editSeed, setEditSeed] = useState(0);
    const [editSelected, setEditSelected] = useState({});

    const [infoOpen, setInfoOpen] = useState(false);
    const [infoShown, setInfoShown] = useState(false);

    const actorEmail = (actor?.email || "").trim().toLowerCase();
    const actorOwns = useCallback(
        (record) => GoalUser.actorOwnsRecord(record, actor, users),
        [actor, users],
    );

    const bumpVault = () => setVaultTick((n) => n + 1);

    const loadMessages = useCallback(async () => {
        try {
            const [raw, profileData] = await Promise.all([
                get("messages", { admin: false }),
                get("profile", { admin: false }),
            ]);
            const list = Array.isArray(raw) ? raw : [];
            const nextUsers = Array.isArray(profileData) ? profileData : [];
            const kept = list.filter(isEnvelopeMessage).map((m) => ({
                ...m,
                channel: messageChannel(m),
            }));
            setUsers(nextUsers);
            setMessages(kept);
        } catch (e) {
            console.error("Error fetching messages:", e);
            setMessages([]);
        }
    }, []);

    const ensureIdentity = useCallback(async (email) => {
        const key = (email || "").trim().toLowerCase();
        if (!key) {
            setIdentityReady(false);
            setIdentityPub(null);
            return null;
        }
        try {
            const identity = await loadIdentity(key);
            setIdentityReady(!!identity);
            setIdentityPub(identity ? identity.publicJwk : null);
            if (identity) await publishMessagePublicKey(identity.publicJwk, key, setUsers);
            return identity;
        } catch (e) {
            console.warn("Device key setup failed:", e);
            setIdentityReady(false);
            return null;
        }
    }, []);

    useEffect(() => {
        const onHide = () => clearWrapKeyCache();
        window.addEventListener("pagehide", onHide);
        const t = setTimeout(async () => {
            setLoading(true);
            try {
                await loadMessages();
            } finally {
                setLoading(false);
            }
        }, 0);
        return () => {
            clearTimeout(t);
            window.removeEventListener("pagehide", onHide);
        };
    }, [loadMessages]);

    useEffect(() => {
        const t = setTimeout(() => { ensureIdentity(actorEmail); }, 0);
        return () => clearTimeout(t);
    }, [actorEmail, ensureIdentity]);

    useEffect(() => {
        let cancelled = false;
        const channelMsgs = messages.filter((m) => messageChannel(m) === activeChannel);
        const isDirect = activeChannel === DIRECT_CHANNEL;
        const dKey = isDirect ? null : getVaultPassphrase(activeChannel);

        (async () => {
            const next = {};
            await Promise.all(channelMsgs.map(async (m) => {
                let decryptedText = "";
                let decResult = null;
                if (isDirect || dKey) {
                    decResult = await decryptMessage(m, dKey, actorEmail);
                    if (decResult !== DECRYPT_MISMATCH && decResult !== DECRYPT_INVALID && decResult !== NOT_ADDRESSED) {
                        decryptedText = stripHtml(decResult);
                    }
                }
                next[m.id] = { decryptedText, decResult };
            }));
            if (!cancelled) setDecoded(next);
        })();

        return () => { cancelled = true; };
    }, [messages, activeChannel, vaultTick, actorEmail, identityReady]);

    useEffect(() => {
        const t = setTimeout(() => setPskUnlocked(readPskUnlocked()), 0);
        return () => clearTimeout(t);
    }, [vaultTick]);

    const saveMessages = async (list) => {
        try {
            await save("messages", persistableCollection(list).filter(isEnvelopeMessage), { admin: false });
            await loadMessages();
        } catch (e) {
            console.error("Error saving messages:", e);
            alert("Failed to transmit message data to server.");
        }
    };

    const q = searchQuery.toLowerCase().trim();
    const isDirect = activeChannel === DIRECT_CHANNEL;
    const channelUnlocked = isDirect ? identityReady : !!pskUnlocked[activeChannel];

    const filteredMsgs = useMemo(() => {
        const channelMsgs = messages.filter((m) => messageChannel(m) === activeChannel);
        const matched = channelMsgs.filter((m) => {
            const entry = decoded[m.id] || { decryptedText: "" };
            const email = messageEmail(m, users);
            const stamp = formatMessageCreatedStamp(m);
            return (email && email.toLowerCase().includes(q))
                || (m.timestamp && m.timestamp.toLowerCase().includes(q))
                || (stamp.time && stamp.time.toLowerCase().includes(q))
                || (stamp.date && stamp.date.toLowerCase().includes(q))
                || (entry.decryptedText || "").toLowerCase().includes(q);
        });
        matched.sort((a, b) => getMessageCreatedTime(b) - getMessageCreatedTime(a));
        return matched;
    }, [messages, activeChannel, decoded, users, q]);

    const totalCount = filteredMsgs.length;
    const maxPage = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE));
    const page = Math.min(currentPage, maxPage);
    const startIdx = (page - 1) * ITEMS_PER_PAGE;
    const endIdx = startIdx + ITEMS_PER_PAGE;
    const paginatedMsgs = filteredMsgs.slice(startIdx, endIdx);

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

    const selectChannel = (id) => {
        const next = normalizeChannel(id);
        if (next === activeChannel) return;
        setActiveChannel(next);
        setCurrentPage(1);
    };

    const onSearch = (value) => {
        setSearchQuery(value);
        setCurrentPage(1);
    };

    const unlockVault = async () => {
        const key = vaultKey.trim();
        if (!key) return alert(`Enter the ${channelMeta(activeChannel).label} key to unlock`);
        setUnlocking(true);
        try {
            setVaultPassphrase(key, activeChannel);
            setVaultKey("");
            setVaultShow(false);
            bumpVault();
        } finally {
            setUnlocking(false);
        }
    };

    const lockVault = () => {
        setVaultPassphrase(null, activeChannel);
        bumpVault();
    };

    const refreshMessages = async () => {
        setRefreshSpin(true);
        try {
            await loadMessages();
            await ensureIdentity(actorEmail);
            bumpVault();
        } catch (e) {
            console.error("Error during manual messages refresh:", e);
        } finally {
            later(() => setRefreshSpin(false), 500);
        }
    };

    const selectedRecipientProfiles = (selected) => {
        const emails = new Set(actorEmail ? [actorEmail] : []);
        Object.keys(selected).forEach((email) => {
            if (selected[email]) emails.add(email.toLowerCase());
        });
        return [...emails].map((email) => {
            const u = users.find((p) => (p.email || "").trim().toLowerCase() === email);
            const msgPub = (u && u.msgPub) || (email === actorEmail ? identityPub : null);
            return { email, msgPub, name: u && u.name };
        }).filter((r) => r.email && r.msgPub);
    };

    const openCompose = () => {
        setComposeChannel(activeChannel);
        setComposeKey("");
        setComposeKeyShow(false);
        setComposeSelected(actorEmail ? { [actorEmail]: true } : {});
        setComposeSeed((n) => n + 1);
        openModal(setComposeOpen, setComposeShown);
    };

    const sendMessage = async () => {
        const current = actorRef.current || { name: "A Team Member", email: "" };
        const channel = normalizeChannel(composeChannel);
        const rawHtml = getEditorHtml(composeEditorRef.current);
        const rawText = stripHtml(rawHtml);
        if (!rawText) return alert("Message content is required");

        let envelope;
        if (channel === DIRECT_CHANNEL) {
            await ensureIdentity((current.email || "").trim().toLowerCase());
            const recipients = selectedRecipientProfiles(composeSelected);
            if (!recipients.length) return alert("Select at least one teammate who has a device key.");
            try {
                envelope = await encryptDirectEnvelope(rawHtml, recipients, (current.email || "").trim().toLowerCase());
            } catch (e) {
                return alert(e.message || "Could not seal the direct message.");
            }
        } else {
            const typedKey = composeKey.trim();
            const key = typedKey || getVaultPassphrase(channel);
            if (!key) return alert(`${channelMeta(channel).label} key and message content are required`);
            setVaultPassphrase(key, channel);
            envelope = await encryptEnvelope(rawHtml, key);
        }

        setActiveChannel(channel);
        bumpVault();

        const list = cloneMessages(await get("messages", { admin: false })).filter(isEnvelopeMessage);
        const now = nextItemId();
        const record = {
            id: now,
            createdAt: new Date(now).toISOString(),
            author: current.name,
            email: (current.email || "").trim().toLowerCase(),
            channel,
            ...envelope,
            timestamp: new Date(now).toLocaleTimeString(),
        };
        if (channel !== DIRECT_CHANNEL) delete record.to;
        list.push(record);
        await saveMessages(list);

        notifyTeam({
            action: "added",
            actorName: current.name,
            itemName: "an encrypted message",
            module: "Messages",
            excludeEmail: current.email,
        });

        setComposeKey("");
        setComposeKeyShow(false);
        closeModal(setComposeOpen, setComposeShown);
    };

    const deleteMessage = async (id) => {
        const current = actorRef.current || { name: "A Team Member", email: "" };
        const list = cloneMessages(await get("messages", { admin: false }));
        const keptList = list.filter(isEnvelopeMessage);
        const deletedMsg = keptList.find((m) => sameId(m.id, id));
        if (deletedMsg && !GoalUser.actorOwnsRecord(deletedMsg, current, users)) {
            alert("Permission Denied: You can only delete your own messages.");
            return;
        }
        if (!confirm("Permanently delete this message from physical server storage?")) return;
        const filtered = keptList.filter((m) => !sameId(m.id, id));
        await saveMessages(filtered);

        notifyTeam({
            action: "deleted",
            actorName: current.name,
            itemName: "an encrypted message",
            module: "Messages",
            excludeEmail: current.email,
        });
    };

    const openEdit = async (msgId) => {
        const current = actorRef.current || { name: "A Team Member", email: "" };
        const list = await get("messages", { admin: false });
        const item = (Array.isArray(list) ? list : []).find((m) => sameId(m.id, msgId));
        if (!item) return;
        if (!GoalUser.actorOwnsRecord(item, current, users)) {
            alert("Permission Denied: You can only edit your own messages.");
            return;
        }
        setEditId(item.id);
        setEditChannel(messageChannel(item));
        setEditKey("");
        setEditKeyShow(false);
        setEditSelected(actorEmail ? { [actorEmail]: true } : {});
        setEditSeed((n) => n + 1);
        openModal(setEditOpen, setEditShown);
    };

    const saveEditMessage = async () => {
        const channel = normalizeChannel(editChannel);
        const rawHtml = getEditorHtml(editEditorRef.current);
        const rawText = stripHtml(rawHtml);
        if (!rawText) return alert("New message content is required");

        let envelope;
        if (channel === DIRECT_CHANNEL) {
            const current = actorRef.current || { name: "A Team Member", email: "" };
            await ensureIdentity((current.email || "").trim().toLowerCase());
            const recipients = selectedRecipientProfiles(editSelected);
            if (!recipients.length) return alert("Select at least one teammate who has a device key.");
            try {
                envelope = await encryptDirectEnvelope(rawHtml, recipients, (current.email || "").trim().toLowerCase());
            } catch (e) {
                return alert(e.message || "Could not seal the direct message.");
            }
        } else {
            const typedKey = editKey.trim();
            const key = typedKey || getVaultPassphrase(channel);
            if (!key) return alert(`${channelMeta(channel).label} key and new message content are required`);
            setVaultPassphrase(key, channel);
            envelope = await encryptEnvelope(rawHtml, key);
        }

        setActiveChannel(channel);
        bumpVault();

        const current = actorRef.current || { name: "A Team Member", email: "" };
        const list = cloneMessages(await get("messages", { admin: false }));
        const item = list.find((m) => sameId(m.id, editId));
        if (item) {
            if (!GoalUser.actorOwnsRecord(item, current, users)) {
                alert("Permission Denied: You can only edit your own messages.");
                return;
            }
            item.cipher = envelope.cipher;
            item.enc = envelope.enc;
            item.iv = envelope.iv;
            item.wrappedKeys = envelope.wrappedKeys;
            item.channel = channel;
            if (channel === DIRECT_CHANNEL) {
                item.to = envelope.to || [];
                delete item.salt;
            } else {
                item.salt = envelope.salt;
                delete item.to;
            }
            if (!item.email) item.email = (current.email || "").trim().toLowerCase();
            if (!item.author) item.author = current.name;
            await saveMessages(list.filter(isEnvelopeMessage));

            notifyTeam({
                action: "edited",
                actorName: current.name,
                itemName: "an encrypted message",
                module: "Messages",
                excludeEmail: current.email,
            });
        }
        closeModal(setEditOpen, setEditShown, () => setEditId(null));
    };

    const composeIsDirect = normalizeChannel(composeChannel) === DIRECT_CHANNEL;
    const editIsDirect = normalizeChannel(editChannel) === DIRECT_CHANNEL;
    const composeUnlocked = !!pskUnlocked[composeChannel];
    const editUnlocked = !!pskUnlocked[editChannel];
    const composeMeta = channelMeta(composeChannel);
    const editMeta = channelMeta(editChannel);
    const activeMeta = channelMeta(activeChannel);

    const keyHint = (unlocked, meta) => unlocked
        ? `Using the unlocked ${meta.label} key. Leave blank or enter a different key.`
        : "";
    const keyPlaceholder = (unlocked, meta) => unlocked
        ? `Optional — using unlocked ${meta.label} key`
        : `Enter ${meta.label} secret...`;

    const emptyCopy = q
        ? `No unlocked ${activeMeta.label} messages match your search.`
        : isDirect
            ? "No direct messages. Seal a note to selected teammates to see it here."
            : `No messages in ${activeMeta.label}. Encrypt and transmit to this channel to see them here.`;

    return (
        <div className="messages-module">
            <div className="container">
                <div
                    className="header-container"
                    style={{ display: "grid", gridTemplateColumns: "40px 1fr auto", alignItems: "center", marginBottom: 24, borderBottom: "1px solid var(--border-color)", paddingBottom: 16 }}
                >
                    <div></div>
                    <h2 style={{ margin: "0 auto", borderBottom: "none", paddingBottom: 0, fontSize: "1.8rem", display: "flex", alignItems: "center", gap: 10 }}>
                        Messages
                        <IconBtn title="About this module" onClick={() => openModal(setInfoOpen, setInfoShown)} style={{ width: "auto", height: "auto", fontSize: "1rem" }} hoverScale={1.15}>
                            <i className="fa-solid fa-circle-info"></i>
                        </IconBtn>
                    </h2>
                    <div className="header-actions-right" style={{ display: "flex", alignItems: "center", gap: 4, justifySelf: "end" }}>
                        <IconBtn className="refresh-btn" title="Refresh messages data" onClick={refreshMessages}>
                            <i className={`fa-solid fa-arrows-rotate${refreshSpin ? " fa-spin" : ""}`}></i>
                        </IconBtn>
                        <IconBtn className="close-module-btn" title="Close module" onClick={closeModule}>
                            <i className="fa-solid fa-xmark"></i>
                        </IconBtn>
                    </div>
                </div>

                <div className="header-actions" style={{ marginBottom: 24, display: "flex", gap: 16, alignItems: "center" }}>
                    <div className="search-input-wrapper" style={{ flex: 1 }}>
                        <input
                            type="text"
                            placeholder="Search unlocked messages..."
                            value={searchQuery}
                            onChange={(e) => onSearch(e.target.value)}
                        />
                    </div>
                    <button
                        type="button"
                        onClick={openCompose}
                        style={{ width: "auto", padding: "10px 18px", fontSize: "0.9rem", background: ACCENT, borderColor: ACCENT, color: "#111827", fontWeight: 600 }}
                    >
                        New message
                    </button>
                </div>

                {loading ? (
                    <MessagesSkeleton />
                ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                        <div>
                            <div className="channel-tabs">
                                {CHANNELS.map((c) => {
                                    const unlocked = c.id === DIRECT_CHANNEL
                                        ? identityReady
                                        : !!pskUnlocked[c.id];
                                    const active = c.id === activeChannel;
                                    return (
                                        <button
                                            type="button"
                                            key={c.id}
                                            className={`channel-tab${active ? " is-active" : ""}`}
                                            title={c.hint}
                                            onClick={() => selectChannel(c.id)}
                                        >
                                            <i className={`fa-solid ${unlocked ? "fa-lock-open" : "fa-lock"}`}></i>
                                            <span>{c.label}</span>
                                        </button>
                                    );
                                })}
                            </div>

                            {isDirect ? (
                                <div style={{ background: "rgba(52, 211, 153, 0.05)", border: "1px solid rgba(52, 211, 153, 0.15)", padding: 16, borderRadius: 12, marginBottom: 20 }}>
                                    <div style={{ fontSize: "0.85rem", fontWeight: 600, color: ACCENT, marginBottom: 6 }}>Direct</div>
                                    <p style={{ margin: 0, fontSize: "0.8rem", color: "#9ca3af" }}>
                                        {identityReady
                                            ? "This device can open Direct messages sealed to you."
                                            : "Preparing your device key…"}
                                    </p>
                                </div>
                            ) : (
                                <div style={{ background: "rgba(52, 211, 153, 0.05)", border: "1px solid rgba(52, 211, 153, 0.15)", padding: 16, borderRadius: 12, marginBottom: 20 }}>
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                                        <span style={{ fontSize: "0.85rem", fontWeight: 600, color: ACCENT }}>{activeMeta.label} key</span>
                                        <span style={{ fontSize: "0.75rem", color: channelUnlocked ? ACCENT : "#9ca3af" }}>{channelUnlocked ? "Unlocked" : "Locked"}</span>
                                    </div>
                                    {channelUnlocked ? (
                                        <div className="vault-bar-row" style={{ justifyContent: "space-between" }}>
                                            <span style={{ fontSize: "0.85rem", color: "#9ca3af" }}>{activeMeta.label} unlocked for this session</span>
                                            <button type="button" className="vault-action-btn" onClick={lockVault} style={{ background: "transparent", border: "1px solid rgba(239,68,68,0.35)", color: "#ef4444" }}>Lock</button>
                                        </div>
                                    ) : (
                                        <div className="vault-bar-row">
                                            <PasswordField
                                                value={vaultKey}
                                                onChange={setVaultKey}
                                                show={vaultShow}
                                                onToggle={() => setVaultShow((v) => !v)}
                                                placeholder="Enter key to unlock..."
                                                onEnter={unlockVault}
                                                inputStyle={{ marginBottom: 0, borderColor: "rgba(52, 211, 153, 0.3)" }}
                                            />
                                            <button type="button" className="vault-action-btn" onClick={unlockVault} disabled={unlocking} style={{ background: ACCENT, borderColor: ACCENT, color: "#111827" }}>
                                                {unlocking ? "Unlocking..." : "Unlock"}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="msg-stream list-container" style={{ marginBottom: 12 }}>
                                {totalCount === 0 ? (
                                    <div className="empty-state"><p>{emptyCopy}</p></div>
                                ) : paginatedMsgs.map((m) => {
                                    const entry = decoded[m.id];
                                    let isDecrypted = false;
                                    let isError = false;
                                    let bodyHtml = escapeHtml(LOCKED_PLACEHOLDER);
                                    let bodyClass = "is-locked";
                                    if (entry && (isDirect || channelUnlocked)) {
                                        const decResult = entry.decResult;
                                        if (decResult === DECRYPT_MISMATCH || decResult === DECRYPT_INVALID) {
                                            isError = true;
                                            bodyHtml = escapeHtml(decResult);
                                            bodyClass = "is-error";
                                        } else if (decResult && decResult !== NOT_ADDRESSED) {
                                            isDecrypted = true;
                                            bodyHtml = sanitizeHtml(decResult);
                                            bodyClass = "is-decrypted";
                                        }
                                    }
                                    const isOwner = actorOwns(m);
                                    const stamp = formatMessageCreatedStamp(m);
                                    const email = messageEmail(m, users) || "Unknown";
                                    const toList = Array.isArray(m.to) ? m.to.filter(Boolean) : [];
                                    return (
                                        <div
                                            key={m.id}
                                            className={`card accordion-card${isOwner ? " has-visible-actions" : ""}`}
                                            style={{ border: "1px solid rgba(255, 255, 255, 0.05)", borderLeft: isDecrypted ? "4px solid #10b981" : (isError ? "4px solid #ef4444" : "4px solid #475569") }}
                                        >
                                            {isOwner ? (
                                                <div className="msg-card-actions">
                                                    <button type="button" className="secondary-btn" style={{ padding: "2px 6px", fontSize: "0.7rem", width: "auto", borderRadius: 4, background: "rgba(52, 211, 153, 0.1)", color: ACCENT, marginBottom: 0, border: "1px solid rgba(52, 211, 153, 0.15)" }} onClick={() => openEdit(m.id)}>
                                                        <i className="fa-solid fa-pen"></i>
                                                    </button>
                                                    <button type="button" className="secondary-btn" style={{ padding: "2px 6px", fontSize: "0.7rem", width: "auto", borderRadius: 4, background: "rgba(239,68,68,0.1)", color: "#ef4444", marginBottom: 0 }} onClick={() => deleteMessage(m.id)}>
                                                        <i className="fa-solid fa-trash"></i>
                                                    </button>
                                                </div>
                                            ) : null}
                                            <div className={`msg-card-body ${bodyClass}`} dangerouslySetInnerHTML={{ __html: bodyHtml }} />
                                            <div className="msg-card-footer">
                                                <span className="msg-card-email">{email}</span>
                                                {toList.length ? <span className="msg-card-to">to {toList.join(", ")}</span> : null}
                                            </div>
                                            {stamp.time ? (
                                                <div className="msg-created-stamp" title={`Created ${stamp.time} ${stamp.date}`}>
                                                    <span className="msg-created-time">{stamp.time}</span>
                                                    <span className="msg-created-date">{stamp.date}</span>
                                                </div>
                                            ) : null}
                                        </div>
                                    );
                                })}
                            </div>

                            {totalCount > 0 ? (
                                <PaginationBar
                                    start={startIdx + 1}
                                    end={Math.min(endIdx, totalCount)}
                                    total={totalCount}
                                    prevDisabled={page === 1}
                                    nextDisabled={endIdx >= totalCount}
                                    onPrev={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                    onNext={() => setCurrentPage((p) => p + 1)}
                                />
                            ) : null}
                        </div>
                    </div>
                )}
            </div>

            <ModuleModal open={composeOpen} shown={composeShown} onBackdrop={() => closeModal(setComposeOpen, setComposeShown)}>
                <div className="modal-content">
                    <div className="modal-header">
                        <h3 style={{ margin: "0 auto", color: ACCENT }}> Send Encrypted Feed</h3>
                        <span className="close-btn" onClick={() => closeModal(setComposeOpen, setComposeShown)}>&times;</span>
                    </div>
                    <div className="modal-body">
                        <label htmlFor="composeChannel" style={{ fontSize: "0.85rem", color: "#9ca3af", display: "block", marginBottom: 6 }}>Channel</label>
                        <select id="composeChannel" className="msg-channel-select" value={composeChannel} onChange={(e) => setComposeChannel(e.target.value)}>
                            {CHANNELS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                        </select>
                        {composeIsDirect ? (
                            <>
                                <label style={{ fontSize: "0.85rem", color: "#9ca3af", display: "block", marginBottom: 6 }}>Send to</label>
                                <RecipientPicker
                                    users={users}
                                    actorEmail={actorEmail}
                                    identityPub={identityPub}
                                    selected={composeSelected}
                                    onToggle={(email) => setComposeSelected((prev) => ({ ...prev, [email]: !prev[email] }))}
                                />
                            </>
                        ) : (
                            <>
                                <label htmlFor="sharedKey" style={{ fontSize: "0.85rem", color: "#9ca3af", display: "block", marginBottom: 6 }}>Secret Encryption Key</label>
                                {composeUnlocked ? (
                                    <p style={{ display: "block", margin: "0 0 8px 0", fontSize: "0.75rem", color: ACCENT }}>{keyHint(true, composeMeta)}</p>
                                ) : null}
                                <PasswordField
                                    value={composeKey}
                                    onChange={setComposeKey}
                                    show={composeKeyShow}
                                    onToggle={() => setComposeKeyShow((v) => !v)}
                                    placeholder={keyPlaceholder(composeUnlocked, composeMeta)}
                                    inputStyle={{ padding: "8px 12px", fontSize: "0.85rem" }}
                                />
                            </>
                        )}
                        <label style={{ fontSize: "0.85rem", color: "#9ca3af", display: "block", marginBottom: 6, marginTop: 14 }}>Message Content</label>
                        <RteEditor seedKey={composeSeed} initialHtml="" placeholder="Type message content to encrypt..." editorRef={composeEditorRef} />
                        <button type="button" onClick={sendMessage} style={{ marginTop: 20, background: ACCENT, borderColor: ACCENT, color: "#111827", fontWeight: 600, width: "100%" }}>
                            Encrypt & Transmit
                        </button>
                    </div>
                </div>
            </ModuleModal>

            <ModuleModal open={editOpen} shown={editShown} onBackdrop={() => closeModal(setEditOpen, setEditShown, () => setEditId(null))}>
                <div className="modal-content">
                    <div className="modal-header">
                        <h3 style={{ margin: "0 auto", color: ACCENT }}><i className="fa-solid fa-pen"></i> Edit Encrypted Message</h3>
                        <span className="close-btn" onClick={() => closeModal(setEditOpen, setEditShown, () => setEditId(null))}>&times;</span>
                    </div>
                    <div className="modal-body">
                        <label htmlFor="editChannel" style={{ fontSize: "0.85rem", color: "#9ca3af", display: "block", marginBottom: 6 }}>Channel</label>
                        <select id="editChannel" className="msg-channel-select" value={editChannel} onChange={(e) => setEditChannel(e.target.value)}>
                            {CHANNELS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                        </select>
                        {editIsDirect ? (
                            <>
                                <label style={{ fontSize: "0.85rem", color: "#9ca3af", display: "block", marginBottom: 6 }}>Send to</label>
                                <RecipientPicker
                                    users={users}
                                    actorEmail={actorEmail}
                                    identityPub={identityPub}
                                    selected={editSelected}
                                    onToggle={(email) => setEditSelected((prev) => ({ ...prev, [email]: !prev[email] }))}
                                />
                            </>
                        ) : (
                            <>
                                <label htmlFor="editSharedKey" style={{ fontSize: "0.85rem", color: "#9ca3af", display: "block", marginBottom: 6 }}>Secret Encryption Key</label>
                                {editUnlocked ? (
                                    <p style={{ display: "block", margin: "0 0 8px 0", fontSize: "0.75rem", color: ACCENT }}>{keyHint(true, editMeta)}</p>
                                ) : null}
                                <PasswordField
                                    value={editKey}
                                    onChange={setEditKey}
                                    show={editKeyShow}
                                    onToggle={() => setEditKeyShow((v) => !v)}
                                    placeholder={keyPlaceholder(editUnlocked, editMeta)}
                                    inputStyle={{ padding: "8px 12px", fontSize: "0.85rem" }}
                                />
                            </>
                        )}
                        <label style={{ fontSize: "0.85rem", color: "#9ca3af", display: "block", marginBottom: 6, marginTop: 14 }}>Message Content</label>
                        <RteEditor seedKey={editSeed} initialHtml="" placeholder="Type message content to encrypt..." editorRef={editEditorRef} />
                        <button type="button" onClick={saveEditMessage} style={{ marginTop: 20, background: ACCENT, borderColor: ACCENT, color: "#111827", fontWeight: 600, width: "100%" }}>
                            Save Changes
                        </button>
                    </div>
                </div>
            </ModuleModal>

            <ModuleModal open={infoOpen} shown={infoShown} onBackdrop={() => closeModal(setInfoOpen, setInfoShown)}>
                <div className="modal-content">
                    <div className="modal-header">
                        <h3 style={{ margin: "0 auto", display: "flex", alignItems: "center", gap: 8 }}>
                            <i className="fa-solid fa-circle-info" style={{ color: ACCENT }}></i> Messages
                        </h3>
                        <span className="close-btn" onClick={() => closeModal(setInfoOpen, setInfoShown)}>&times;</span>
                    </div>
                    <div className="modal-body" style={{ fontSize: "0.93rem", lineHeight: 1.65, color: "#9ca3af" }}>
                        <div style={{ marginBottom: 20 }}>
                            <h4 style={{ color: ACCENT, margin: "0 0 8px 0", fontSize: "1rem", display: "flex", alignItems: "center", gap: 7 }}>
                                <i className="fa-solid fa-shield-halved"></i> About this Module
                            </h4>
                            <p style={{ margin: 0 }}>An encrypted inbox for secure team announcements, confidential notifications, and credential transmissions. Channel messages use a shared AES-256-GCM key. Direct messages are sealed to selected teammates with per-user device keys.</p>
                        </div>
                        <div>
                            <h4 style={{ color: ACCENT, margin: "0 0 10px 0", fontSize: "1rem", display: "flex", alignItems: "center", gap: 7 }}>
                                <i className="fa-solid fa-list-check"></i> Key Actions
                            </h4>
                            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 9 }}>
                                <li style={{ display: "flex", alignItems: "flex-start", gap: 8 }}><i className="fa-solid fa-circle-check" style={{ color: ACCENT, marginTop: 3, flexShrink: 0 }}></i><span>Compose and transmit encrypted messages to a channel or to selected teammates.</span></li>
                                <li style={{ display: "flex", alignItems: "flex-start", gap: 8 }}><i className="fa-solid fa-circle-check" style={{ color: ACCENT, marginTop: 3, flexShrink: 0 }}></i><span>Unlock General, Credentials, or Leadership with that channel&apos;s secret key. Direct messages open on this device automatically.</span></li>
                                <li style={{ display: "flex", alignItems: "flex-start", gap: 8 }}><i className="fa-solid fa-circle-check" style={{ color: ACCENT, marginTop: 3, flexShrink: 0 }}></i><span>Search unlocked channel messages by keyword, email, or timestamp.</span></li>
                            </ul>
                        </div>
                    </div>
                </div>
            </ModuleModal>
        </div>
    );
}
