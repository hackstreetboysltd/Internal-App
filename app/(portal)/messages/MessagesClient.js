'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { get, save, watch } from "@/lib/portalApi";
import { invalidateCollectionCache } from "@/lib/dataApi";
import { useSession, clearActiveModule } from "@/lib/session";
import ItemMenu from "@/components/ItemMenu";
import BusyButton from "@/components/BusyButton";
import { useBusy } from "@/lib/useBusy";
import RteEditor from "../apps/RteEditor";
import { escapeHtml, getEditorHtml, sanitizeHtml, stripHtml } from "../apps/html";
import {
    DECRYPT_INVALID,
    DECRYPT_MISMATCH,
    DIRECT_CHANNEL,
    LOCKED_PLACEHOLDER,
    NOT_ADDRESSED,
    channelMeta,
    decryptMessage,
    encryptSealedEnvelope,
    identityMsgPub,
    isEnvelopeMessage,
    isCipherRecord,
    loadIdentity,
    messageChannel,
    normalizeChannel,
    normalizeMsgPub,
    resolveRecipientMsgPub,
} from "./crypto";
import { dmChannelId, filterChannelsForActor, findDmChannel, isDmChannel, messageChannelTabs, otherDmMember } from "@/lib/channels";
import { formatPortalCreatedStamp, formatPortalDateTime } from "@/lib/portalTime";
import {
    cloneMessages,
    decryptFingerprint,
    formatMessageCreatedStamp,
    getMessageCreatedTime,
    isMessageEdited,
    nextItemId,
    persistableCollection,
    sameId,
} from "./messagesHelpers";

const ACCENT = "#9b87ff";

const ICON_BTN = {
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "#9ca3af",
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

function CloseModuleBtn({ onClick }) {
    return (
        <IconBtn className="close-module-btn" title="Close module" onClick={onClick}>
            <i className="fa-solid fa-xmark"></i>
        </IconBtn>
    );
}

function roomHue(id) {
    let h = 0;
    for (const c of String(id || "")) h = (h * 33 + c.charCodeAt(0)) % 360;
    return h;
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

function initialsFor(label) {
    const parts = String(label || "")
        .trim()
        .split(/[\s@._-]+/)
        .filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2);
    return `${parts[0][0] || ""}${parts[1][0] || ""}`;
}

function hasHttpAvatar(avatar) {
    return !!(avatar && (String(avatar).startsWith("http://") || String(avatar).startsWith("https://")));
}

function AvatarFace({ src, name, className }) {
    if (hasHttpAvatar(src)) {
        return (
            <span className={`${className} has-photo`} aria-hidden>
                {/* Google avatar URLs — same approach as Profile module */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" referrerPolicy="no-referrer" />
            </span>
        );
    }
    return (
        <span className={className} aria-hidden>
            {initialsFor(name)}
        </span>
    );
}

function MessagesSkeleton() {
    return (
        <div className="msg-shell" aria-busy="true" aria-label="Loading messages">
            <div className="msg-rail">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                    <div className="skel-room-row" key={i}>
                        <span className="skel-line w55"></span>
                        <span className="skel-line sm w40"></span>
                    </div>
                ))}
            </div>
            <div className="msg-stage msg-stage-skel" />
        </div>
    );
}

function RecipientPicker({ users, actorEmail, identityPub, selected, onToggle }) {
    const list = (users || []).filter((u) => (u.email || "").trim());
    const keyed = [];
    const locked = [];
    for (const u of list) {
        const email = (u.email || "").trim().toLowerCase();
        const isMe = email === actorEmail;
        const hasKey = !!normalizeMsgPub(u.msgPub) || (isMe && !!identityPub);
        (hasKey ? keyed : locked).push({ u, email, isMe, hasKey });
    }
    if (!list.length) {
        return <div className="recipient-list"><p className="recipient-empty">No teammates found.</p></div>;
    }
    const row = ({ u, email, isMe, hasKey }) => {
        if (isMe) {
            return (
                <div key={email} className="recipient-row is-you">
                    <span className="recipient-name">{u.name || email}</span>
                    <span className="recipient-email">you · always sealed in</span>
                </div>
            );
        }
        return (
            <label key={email} className={`recipient-row${hasKey ? "" : " is-disabled"}`}>
                <input
                    type="checkbox"
                    value={email}
                    checked={!!selected[email]}
                    disabled={!hasKey}
                    onChange={() => onToggle(email)}
                />
                <span className="recipient-name">{u.name || email}</span>
                <span className="recipient-email">{email}</span>
                {hasKey ? null : <span className="recipient-missing">no device key</span>}
            </label>
        );
    };
    return (
        <div className="recipient-list">
            {keyed.map(row)}
            {locked.length ? (
                <details className="recipient-locked">
                    <summary>{locked.length} without a device key</summary>
                    {locked.map(row)}
                </details>
            ) : null}
        </div>
    );
}

function DmPersonPick({ users, actorEmail, identityPub, onPick }) {
    const [query, setQuery] = useState("");
    const list = (users || [])
        .map((u) => {
            const email = (u.email || "").trim().toLowerCase();
            const isMe = email === actorEmail;
            const hasKey = !!normalizeMsgPub(u.msgPub) || (isMe && !!identityPub);
            return { u, email, isMe, hasKey };
        })
        .filter((row) => row.email && !row.isMe && row.hasKey);
    const needle = query.trim().toLowerCase();
    const visible = needle
        ? list.filter(({ u, email }) => {
            const name = String(u.name || "").toLowerCase();
            return name.includes(needle) || email.includes(needle);
        })
        : list;
    let empty = "";
    if (!list.length) {
        empty = "Nobody else has a device key yet. They need to open Messages once.";
    } else if (!visible.length) {
        empty = "Nothing matches that search.";
    }
    return (
        <>
            <div className="msg-new-dm-search">
                <input
                    type="search"
                    autoFocus
                    placeholder="Search people…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    aria-label="Search people"
                />
            </div>
            {empty ? (
                <p className="recipient-empty">{empty}</p>
            ) : (
                <div className="recipient-list">
                    {visible.map(({ u, email }) => (
                        <button
                            type="button"
                            key={email}
                            className="dm-person-row"
                            onClick={() => onPick(email, u.name || email)}
                        >
                            <AvatarFace src={u.avatar} name={u.name || email} className="msg-face" />
                            <span className="recipient-name">{u.name || email}</span>
                            <span className="recipient-email">{email}</span>
                        </button>
                    ))}
                </div>
            )}
        </>
    );
}

function hybridMsgPubMatches(existing, next) {
    const a = normalizeMsgPub(existing);
    const b = normalizeMsgPub(next);
    if (!a || !b) return false;
    return a.ecdh?.x === b.ecdh?.x && a.ecdh?.y === b.ecdh?.y && a.mlkem === b.mlkem;
}

async function publishMessagePublicKey(msgPub, email, setUsers) {
    const key = (email || "").trim().toLowerCase();
    const pub = normalizeMsgPub(msgPub) ? msgPub : null;
    if (!key || !pub) return;
    try {
        const list = await get("profile", { admin: false });
        if (!Array.isArray(list)) return;
        const idx = list.findIndex((p) => (p.email || "").trim().toLowerCase() === key);
        if (idx === -1) return;
        if (hybridMsgPubMatches(list[idx].msgPub, pub)) return;
        const next = list.slice();
        next[idx] = { ...next[idx], msgPub: pub };
        await save("profile", next, { admin: false });
        setUsers((prev) => prev.map((p) => (
            (p.email || "").trim().toLowerCase() === key ? { ...p, msgPub: pub } : p
        )));
    } catch (e) {
        console.warn("Could not publish message public key:", e);
    }
}

function profileMsgPub(users, email, actorEmail, identityPub) {
    const key = (email || "").trim().toLowerCase();
    if (!key) return null;
    const u = (users || []).find((p) => (p.email || "").trim().toLowerCase() === key);
    return resolveRecipientMsgPub(u?.msgPub, {
        isSelf: key === actorEmail,
        identityPub,
    });
}

function actorOwnsMessage(record, actor) {
    const actorEmail = (actor?.email || "").trim().toLowerCase();
    const recordEmail = (record?.email || "").trim().toLowerCase();
    return !!(actorEmail && recordEmail && actorEmail === recordEmail);
}

function latestInChannel(messages, channelId) {
    let latest = null;
    let latestTime = -1;
    for (const m of messages) {
        if (messageChannel(m) !== channelId) continue;
        const t = getMessageCreatedTime(m);
        if (t >= latestTime) {
            latestTime = t;
            latest = m;
        }
    }
    return latest;
}

export default function MessagesClient() {
    const router = useRouter();
    const { actor } = useSession();
    const actorRef = useRef(actor);
    useEffect(() => { actorRef.current = actor; }, [actor]);

    const composeEditorRef = useRef(null);
    const threadEndRef = useRef(null);
    const timers = useRef([]);
    const later = (fn, ms) => {
        const id = setTimeout(fn, ms);
        timers.current.push(id);
        return id;
    };
    useEffect(() => () => timers.current.forEach(clearTimeout), []);

    const [loading, setLoading] = useState(true);
    const { busy: formBusy, runBusy: runFormBusy } = useBusy();
    const [messages, setMessages] = useState([]);
    const [users, setUsers] = useState([]);
    const [managedChannels, setManagedChannels] = useState([]);
    const [roomQuery, setRoomQuery] = useState("");
    const [openRoom, setOpenRoom] = useState(null);
    const [identityReady, setIdentityReady] = useState(false);
    const [identityPub, setIdentityPub] = useState(null);
    const [decoded, setDecoded] = useState({});
    const decryptCacheRef = useRef(new Map());
    const didPickRoom = useRef(false);

    const [composeSeed, setComposeSeed] = useState(0);
    const [composeSelected, setComposeSelected] = useState({});

    const [editId, setEditId] = useState(null);
    const [editChannel, setEditChannel] = useState(DIRECT_CHANNEL);
    const [editSelected, setEditSelected] = useState({});
    const [editDraftHtml, setEditDraftHtml] = useState("");
    const [newDmOpen, setNewDmOpen] = useState(false);
    const [newDmShown, setNewDmShown] = useState(false);

    const actorEmail = (actor?.email || "").trim().toLowerCase();
    const actorOwns = useCallback(
        (record) => actorOwnsMessage(record, actor),
        [actor],
    );

    const memberChannels = useMemo(() => {
        const email = String(actor?.email || "").trim();
        if (!email) return [];
        return filterChannelsForActor(managedChannels, actor, { adminSeesAll: false });
    }, [managedChannels, actor]);

    const channelCatalog = useMemo(
        () => messageChannelTabs(memberChannels),
        [memberChannels],
    );

    const profileByEmail = useMemo(() => {
        const map = new Map();
        for (const p of Array.isArray(users) ? users : []) {
            const email = (p?.email || "").trim().toLowerCase();
            if (email) map.set(email, p);
        }
        return map;
    }, [users]);

    const deviceKeyDrift = !!(
        identityPub
        && normalizeMsgPub(profileByEmail.get(actorEmail)?.msgPub)
        && !hybridMsgPubMatches(profileByEmail.get(actorEmail)?.msgPub, identityPub)
    );

    const loadMessages = useCallback(async () => {
        try {
            const [raw, profileData, channelData] = await Promise.all([
                get("messages", { admin: false }),
                get("profile", { admin: false }),
                get("channels", { admin: false }),
            ]);
            const list = Array.isArray(raw) ? raw : [];
            const nextUsers = Array.isArray(profileData) ? profileData : [];
            const kept = list.filter(isEnvelopeMessage).map((m) => ({
                ...m,
                channel: messageChannel(m),
            }));
            setUsers(nextUsers);
            setManagedChannels(Array.isArray(channelData) ? channelData : []);
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
            const msgPub = identity ? identityMsgPub(identity) : null;
            setIdentityReady(!!identity);
            setIdentityPub(msgPub);
            if (msgPub) await publishMessagePublicKey(msgPub, key, setUsers);
            return identity;
        } catch (e) {
            console.warn("Device key setup failed:", e);
            setIdentityReady(false);
            return null;
        }
    }, []);

    useEffect(() => {
        invalidateCollectionCache("channels");

        const seen = new Set();
        const mark = (key) => {
            seen.add(key);
            if (seen.size >= 3) setLoading(false);
        };
        const u1 = watch("messages", (raw) => {
            const list = Array.isArray(raw) ? raw : [];
            setMessages(list.filter(isEnvelopeMessage).map((m) => ({
                ...m,
                channel: messageChannel(m),
            })));
            mark("messages");
        }, {
            admin: false,
            onError: (e) => {
                console.error("Error fetching messages:", e);
                setMessages([]);
                mark("messages");
            },
        });
        const u2 = watch("profile", (profileData) => {
            setUsers(Array.isArray(profileData) ? profileData : []);
            mark("profile");
        }, {
            admin: false,
            onError: () => mark("profile"),
        });
        const u3 = watch("channels", (channelData) => {
            setManagedChannels(Array.isArray(channelData) ? channelData : []);
            mark("channels");
        }, {
            admin: false,
            onError: () => {
                setManagedChannels([]);
                mark("channels");
            },
        });
        return () => {
            u1();
            u2();
            u3();
        };
    }, []);

    useEffect(() => {
        if (!openRoom) return;
        const ids = new Set(channelCatalog.map((c) => c.id));
        if (!ids.has(openRoom)) setOpenRoom(null);
    }, [channelCatalog, openRoom]);

    useEffect(() => {
        if (loading || didPickRoom.current || !channelCatalog.length) return;
        didPickRoom.current = true;
        if (openRoom) return;
        setOpenRoom(channelCatalog[0].id);
    }, [loading, channelCatalog, openRoom]);

    useEffect(() => {
        const t = setTimeout(() => { ensureIdentity(actorEmail); }, 0);
        return () => clearTimeout(t);
    }, [actorEmail, ensureIdentity]);

    const decryptTargets = useMemo(() => {
        if (openRoom) {
            return messages.filter((m) => messageChannel(m) === openRoom);
        }
        return memberChannels.map((c) => String(c.id)).map((id) => latestInChannel(messages, id)).filter(Boolean);
    }, [messages, openRoom, memberChannels]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (!identityReady) {
                if (!cancelled) setDecoded({});
                return;
            }
            const cache = decryptCacheRef.current;
            const pending = decryptTargets.filter((m) => {
                const fp = decryptFingerprint(m);
                const hit = cache.get(m.id);
                return !hit || hit.fp !== fp;
            });

            await Promise.all(pending.map(async (m) => {
                let decryptedText = "";
                const fp = decryptFingerprint(m);
                const decResult = await decryptMessage(m, null, actorEmail);
                if (decResult !== DECRYPT_MISMATCH && decResult !== DECRYPT_INVALID && decResult !== NOT_ADDRESSED) {
                    decryptedText = stripHtml(decResult);
                }
                cache.set(m.id, { fp, decryptedText, decResult });
            }));

            if (cancelled) return;
            const next = {};
            decryptTargets.forEach((m) => {
                const hit = cache.get(m.id);
                if (hit) next[m.id] = { decryptedText: hit.decryptedText, decResult: hit.decResult };
            });
            if (openRoom) {
                messages.filter((m) => messageChannel(m) === openRoom).forEach((m) => {
                    const hit = cache.get(m.id);
                    if (hit) next[m.id] = { decryptedText: hit.decryptedText, decResult: hit.decResult };
                });
            }
            setDecoded(next);
        })();
        return () => { cancelled = true; };
    }, [decryptTargets, messages, openRoom, actorEmail, identityReady]);

    const saveMessages = async (list) => {
        try {
            await save("messages", persistableCollection(list).filter(isCipherRecord), { admin: false });
            await loadMessages();
            return true;
        } catch (e) {
            console.error("Error saving messages:", e);
            alert("Failed to transmit message data to server.");
            return false;
        }
    };

    const q = roomQuery.toLowerCase().trim();
    const openChannel = (managedChannels || []).find((c) => String(c?.id) === String(openRoom));
    const isLegacyDirect = openRoom === DIRECT_CHANNEL;
    const isDm = isDmChannel(openChannel) || String(openRoom || "").startsWith("dm-");
    const catalogMeta = channelMeta(openRoom, channelCatalog);
    const dmOtherEmail = isDm ? otherDmMember(openChannel, actorEmail) : "";
    const activeMeta = isDm
        ? {
            ...catalogMeta,
            label: profileByEmail.get(dmOtherEmail)?.name || dmOtherEmail || catalogMeta.label,
        }
        : catalogMeta;

    const threadMsgs = useMemo(() => {
        if (!openRoom) return [];
        const channelMsgs = messages.filter((m) => messageChannel(m) === openRoom);
        channelMsgs.sort((a, b) => getMessageCreatedTime(a) - getMessageCreatedTime(b));
        return channelMsgs;
    }, [messages, openRoom]);

    useEffect(() => {
        if (!openRoom) return;
        threadEndRef.current?.scrollIntoView({ block: "end" });
    }, [openRoom, threadMsgs.length]);

    const lobbyRooms = useMemo(() => {
        const rooms = memberChannels.map((ch) => {
            const id = String(ch.id);
            const count = messages.filter((m) => messageChannel(m) === id).length;
            const last = latestInChannel(messages, id);
            const preview = last
                ? (decoded[last.id]?.decryptedText || last.author || "Sealed message")
                : (isDmChannel(ch) ? "No messages yet" : "No messages yet");
            const lastTime = last ? getMessageCreatedTime(last) : 0;
            const lastStamp = last ? formatMessageCreatedStamp(last) : null;
            const dm = isDmChannel(ch);
            const other = dm ? otherDmMember(ch, actorEmail) : "";
            const otherProfile = other ? profileByEmail.get(other) : null;
            return {
                id,
                label: dm ? (otherProfile?.name || other || "Direct") : (ch.name || ch.slug || id),
                slug: ch.slug || id,
                hint: ch.description || "",
                memberEmails: Array.isArray(ch.memberEmails) ? ch.memberEmails : [],
                count,
                preview,
                lastTime,
                lastStamp,
                isDirect: dm,
                avatar: dm ? (otherProfile?.avatar || "") : "",
            };
        });
        const list = rooms.slice();
        list.sort((a, b) => (b.lastTime || 0) - (a.lastTime || 0));
        if (!q) return list;
        return list.filter((room) => {
            const members = (room.memberEmails || []).join(" ");
            const hay = `${room.label} ${room.slug} ${room.hint} ${room.preview} ${members}`.toLowerCase();
            return hay.includes(q);
        });
    }, [memberChannels, messages, decoded, q, actorEmail, profileByEmail]);

    const openModal = (setOpen, setShown) => {
        setOpen(true);
        later(() => setShown(true), 10);
    };
    const closeModule = () => {
        clearActiveModule();
        router.push("/");
    };

    const closeModal = (setOpen, setShown, after) => {
        setShown(false);
        later(() => {
            setOpen(false);
            if (after) after();
        }, 300);
    };

    const cancelEdit = () => {
        setEditId(null);
        setEditChannel(DIRECT_CHANNEL);
        setEditSelected({});
        setEditDraftHtml("");
        setComposeSeed((n) => n + 1);
    };

    const openChat = (id) => {
        const next = normalizeChannel(id, channelCatalog);
        if (next === openRoom) return;
        setOpenRoom(next);
        setComposeSelected(actorEmail ? { [actorEmail]: true } : {});
        cancelEdit();
    };

    const leaveChat = () => {
        setOpenRoom(null);
        cancelEdit();
    };

    const startDirectWith = (email) => runFormBusy(async () => {
        const other = String(email || "").trim().toLowerCase();
        if (!other || other === actorEmail) return;
        const existing = findDmChannel(managedChannels, actorEmail, other);
        if (existing?.id) {
            openChat(existing.id);
            closeModal(setNewDmOpen, setNewDmShown);
            return;
        }
        const id = dmChannelId(actorEmail, other);
        if (!id) return;
        const current = actorRef.current || {};
        const list = await get("channels", { admin: false });
        const next = Array.isArray(list) ? list.slice() : [];
        if (!next.some((c) => String(c?.id) === id)) {
            const now = new Date().toISOString();
            next.push({
                id,
                slug: id,
                kind: "dm",
                name: "Direct",
                description: "Sealed 1:1",
                memberEmails: [actorEmail, other],
                createdByEmail: actorEmail,
                createdAt: now,
                updatedAt: now,
                author: current.name || "",
                email: actorEmail,
            });
            await save("channels", next, { admin: false });
            setManagedChannels(next);
        }
        closeModal(setNewDmOpen, setNewDmShown);
        openChat(id);
    });

    const selectedRecipientProfiles = (selected) => {
        const emails = new Set(actorEmail ? [actorEmail] : []);
        Object.keys(selected || {}).forEach((email) => {
            if (selected[email]) emails.add(email.toLowerCase());
        });
        return [...emails].map((email) => {
            const u = users.find((p) => (p.email || "").trim().toLowerCase() === email);
            const msgPub = profileMsgPub(users, email, actorEmail, identityPub);
            return { email, msgPub, name: u && u.name };
        }).filter((r) => r.email && r.msgPub);
    };

    const channelRecipientProfiles = (channelId) => {
        const ch = (managedChannels || []).find((c) => String(c?.id) === String(channelId));
        const memberEmails = Array.isArray(ch?.memberEmails) ? ch.memberEmails : [];
        const emails = [...new Set(memberEmails.map((e) => String(e || "").trim().toLowerCase()).filter(Boolean))];
        return emails.map((email) => {
            const u = users.find((p) => (p.email || "").trim().toLowerCase() === email);
            const msgPub = profileMsgPub(users, email, actorEmail, identityPub);
            return { email, msgPub, name: u && u.name };
        }).filter((r) => r.email && r.msgPub);
    };

    const sealAndSave = async ({ html, channel, selected, replaceId }) => {
        const current = actorRef.current || { name: "A Team Member", email: "" };
        const email = (current.email || "").trim().toLowerCase();
        const room = normalizeChannel(channel, channelCatalog);
        const rawText = stripHtml(html);
        if (!rawText) {
            alert("Message content is required");
            return false;
        }

        await ensureIdentity(email);

        let recipients;
        if (room === DIRECT_CHANNEL) {
            recipients = selectedRecipientProfiles(selected);
            if (!recipients.length) {
                alert("Select at least one teammate who has a device key.");
                return false;
            }
        } else {
            recipients = channelRecipientProfiles(room);
            if (!recipients.length) {
                alert("No channel members with a hybrid device key. Members must open Messages once.");
                return false;
            }
        }

        let envelope;
        try {
            envelope = await encryptSealedEnvelope(html, recipients, email);
        } catch (e) {
            alert(e.message || "Could not seal the message.");
            return false;
        }

        if (envelope.skippedNoKey) {
            alert(`${envelope.skippedNoKey} member(s) were skipped because they have no hybrid device key.`);
        }

        const { skippedNoKey: _skipped, ...envelopeFields } = envelope;
        const list = cloneMessages(await get("messages", { admin: false })).filter(isCipherRecord);

        if (replaceId) {
            const item = list.find((m) => sameId(m.id, replaceId));
            if (!item) return false;
            if (!actorOwnsMessage(item, current)) {
                alert("Permission Denied: You can only edit your own messages.");
                return false;
            }
            item.cipher = envelope.cipher;
            item.enc = envelope.enc;
            item.iv = envelope.iv;
            item.wrappedKeys = envelope.wrappedKeys;
            item.to = envelope.to || [];
            item.channel = room;
            delete item.salt;
            item.email = email || item.email;
            if (!item.author) item.author = current.name;
            return saveMessages(list.filter(isCipherRecord));
        }

        const now = nextItemId();
        list.push({
            id: now,
            createdAt: new Date(now).toISOString(),
            author: current.name,
            email,
            channel: room,
            ...envelopeFields,
            timestamp: formatPortalDateTime(now),
        });
        return saveMessages(list);
    };

    const sendFromComposer = () => runFormBusy(async () => {
        if (!openRoom || editId) return;
        const rawHtml = getEditorHtml(composeEditorRef.current);
        const ok = await sealAndSave({
            html: rawHtml,
            channel: openRoom,
            selected: composeSelected,
        });
        if (ok) setComposeSeed((n) => n + 1);
    });

    const onComposerKeyDown = (e) => {
        if (e.key === "Escape" && editId) {
            e.preventDefault();
            cancelEdit();
            return;
        }
        if (e.key !== "Enter" || e.shiftKey) return;
        e.preventDefault();
        if (editId) saveEditMessage();
        else sendFromComposer();
    };

    const deleteMessage = async (id) => {
        const current = actorRef.current || { name: "A Team Member", email: "" };
        const list = cloneMessages(await get("messages", { admin: false }));
        const keptList = list.filter(isCipherRecord);
        const deletedMsg = keptList.find((m) => sameId(m.id, id));
        if (deletedMsg && !actorOwnsMessage(deletedMsg, current)) {
            alert("Permission Denied: You can only delete your own messages.");
            return;
        }
        if (!confirm("Permanently delete this message from physical server storage?")) return;
        const filtered = keptList.filter((m) => !sameId(m.id, id));
        await saveMessages(filtered);
    };

    const clearChat = async (channelId) => {
        const id = String(channelId || "");
        if (!id) return;
        if (!confirm(
            "Clear your messages in this chat? Messages from others will remain. The channel stays.",
        )) return;
        const current = actorRef.current || { name: "A Team Member", email: "" };
        const list = cloneMessages(await get("messages", { admin: false })).filter(isCipherRecord);
        const filtered = list.filter(
            (m) => !(messageChannel(m) === id && actorOwnsMessage(m, current)),
        );
        await saveMessages(filtered);
    };

    const deleteChat = async (channelId) => {
        const id = String(channelId || "");
        if (!id) return;
        const current = actorRef.current || { name: "A Team Member", email: "" };
        const isAdmin = Array.isArray(current.roles) && current.roles.includes("admin");
        const ch = (managedChannels || []).find((c) => String(c?.id) === id);
        const dm = isDmChannel(ch) || id.startsWith("dm-");

        if (!isAdmin && !dm && id !== DIRECT_CHANNEL) {
            alert("Only admins can delete group channels. You can clear your own messages instead.");
            return;
        }

        const confirmCopy = isAdmin
            ? "Delete this chat? Your messages will be removed and the channel will be deleted. Other people’s messages stay in storage until they remove them."
            : dm
              ? "Leave this direct chat? Your messages will be removed. The other person’s messages remain, and the thread may still appear for them."
              : "Delete this chat and your messages?";

        if (!confirm(confirmCopy)) return;

        const list = cloneMessages(await get("messages", { admin: false })).filter(isCipherRecord);
        const filtered = list.filter(
            (m) => !(messageChannel(m) === id && actorOwnsMessage(m, current)),
        );
        await saveMessages(filtered);

        if (id !== DIRECT_CHANNEL && isAdmin) {
            try {
                const channels = await get("channels", { admin: false });
                const next = (Array.isArray(channels) ? channels : []).filter((c) => String(c?.id) !== id);
                await save("channels", next, { admin: false });
                setManagedChannels(next);
            } catch (e) {
                console.error("Error deleting channel:", e);
                alert("Your messages were cleared, but the channel could not be removed.");
            }
        }
        if (String(openRoom) === id) leaveChat();
    };

    const openEdit = (msgId) => {
        const current = actorRef.current || { name: "A Team Member", email: "" };
        const item = messages.find((m) => sameId(m.id, msgId));
        if (!item) return;
        if (!actorOwnsMessage(item, current)) {
            alert("Permission Denied: You can only edit your own messages.");
            return;
        }
        const entry = decoded[msgId];
        const dec = entry?.decResult;
        if (
            !dec
            || dec === NOT_ADDRESSED
            || dec === DECRYPT_MISMATCH
            || dec === DECRYPT_INVALID
            || dec === LOCKED_PLACEHOLDER
        ) {
            alert("This message isn’t unlocked yet, so it can’t be edited.");
            return;
        }
        const selected = {};
        (Array.isArray(item.to) ? item.to : []).forEach((email) => {
            const key = String(email || "").trim().toLowerCase();
            if (key) selected[key] = true;
        });
        if (actorEmail) selected[actorEmail] = true;
        setEditId(item.id);
        setEditChannel(messageChannel(item));
        setEditSelected(selected);
        setEditDraftHtml(sanitizeHtml(dec));
        setComposeSeed((n) => n + 1);
        later(() => {
            const el = composeEditorRef.current;
            if (!el) return;
            el.focus();
            const range = document.createRange();
            range.selectNodeContents(el);
            range.collapse(false);
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(range);
        }, 40);
    };

    const saveEditMessage = () => runFormBusy(async () => {
        if (!editId) return;
        const rawHtml = getEditorHtml(composeEditorRef.current);
        if (sanitizeHtml(rawHtml) === sanitizeHtml(editDraftHtml)) {
            cancelEdit();
            return;
        }
        const ok = await sealAndSave({
            html: rawHtml,
            channel: editChannel,
            selected: editSelected,
            replaceId: editId,
        });
        if (ok) cancelEdit();
    });

    const composeMemberCount = isLegacyDirect
        ? 0
        : ((managedChannels || []).find((c) => String(c?.id) === String(openRoom))?.memberEmails || []).length;

    const emptyLobby = q
        ? "Nothing matches that search."
        : "Tap New for a direct thread, or wait to be added to a channel.";

    const emptyThread = isDm
        ? `Only you and ${activeMeta.label} can read this.`
        : isLegacyDirect
            ? "Nobody’s in this thread yet. Pick people and send."
            : "Dead air. Drop the first note.";

    const openRoomMembers = useMemo(() => {
        if (!openRoom || isLegacyDirect || isDm) return [];
        const ch = (managedChannels || []).find((c) => String(c?.id) === String(openRoom));
        const emails = Array.isArray(ch?.memberEmails) ? ch.memberEmails : [];
        return emails
            .map((e) => String(e || "").trim().toLowerCase())
            .filter(Boolean)
            .slice(0, 4)
            .map((email) => {
                const profile = profileByEmail.get(email);
                return { email, label: profile?.name || email, avatar: profile?.avatar || "" };
            });
    }, [openRoom, isLegacyDirect, isDm, managedChannels, profileByEmail]);

    const renderBubble = (m) => {
        const entry = decoded[m.id];
        let isDecrypted = false;
        let isError = false;
        let bodyHtml = escapeHtml(LOCKED_PLACEHOLDER);
        let bodyClass = "is-locked";
        if (entry && identityReady) {
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
        const isMine = actorOwns(m);
        const stamp = formatMessageCreatedStamp(m);
        const edited = isMessageEdited(m);
        const editedStamp = edited ? formatPortalCreatedStamp(m.editedAt) : { time: "", date: "" };
        const toNames = (Array.isArray(m.to) ? m.to : [])
            .map((e) => String(e || "").trim().toLowerCase())
            .filter(Boolean)
            .filter((e) => e !== actorEmail)
            .map((e) => profileByEmail.get(e)?.name || e);
        return (
            <div
                key={m.id}
                className={`msg-bubble-row ${isMine ? "is-mine" : "is-theirs"}${editId && sameId(editId, m.id) ? " is-editing" : ""}`}
            >
                {isMine ? (
                    <div className="msg-bubble-actions">
                        <ItemMenu
                            icon="fa-solid fa-ellipsis-vertical"
                            items={[
                                { label: "Edit", onClick: () => openEdit(m.id) },
                                { label: "Delete", onClick: () => deleteMessage(m.id), danger: true },
                            ]}
                        />
                    </div>
                ) : null}
                <div className="msg-bubble-stack">
                    <div className="msg-bubble">
                        <div className={`msg-card-body ${bodyClass}`} dangerouslySetInnerHTML={{ __html: bodyHtml }} />
                        <div className="msg-bubble-meta">
                            {isLegacyDirect && toNames.length ? (
                                <span className="msg-to" title={toNames.join(", ")}>
                                    to {toNames.join(", ")}
                                </span>
                            ) : null}
                            {edited ? (
                                <span
                                    className="msg-edited"
                                    title={editedStamp.time ? `Edited ${editedStamp.time} ${editedStamp.date}` : "Edited"}
                                >
                                    Edited
                                </span>
                            ) : null}
                            {stamp.time ? <span className="msg-stamp" title={`${stamp.time} ${stamp.date}`}>{stamp.time}</span> : null}
                            {isError || !isDecrypted ? <span className="msg-seal-state">{isError ? "failed" : "sealed"}</span> : null}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className={`messages-module is-split${openRoom ? " is-thread-open" : ""}`}>
            <div className="container">
                {loading ? (
                    <MessagesSkeleton />
                ) : (
                    <div className="msg-shell">
                        <aside className="msg-rail" aria-label="Channels and Direct">
                            <div className="msg-rail-search">
                                <input
                                    type="search"
                                    placeholder="Search rooms…"
                                    value={roomQuery}
                                    onChange={(e) => setRoomQuery(e.target.value)}
                                />
                                <button
                                    type="button"
                                    className="msg-new-dm-btn"
                                    onClick={() => openModal(setNewDmOpen, setNewDmShown)}
                                >
                                    New
                                </button>
                                <span className="msg-rail-close">
                                    <CloseModuleBtn onClick={closeModule} />
                                </span>
                            </div>
                            <div className="msg-rail-list" role="list">
                                {lobbyRooms.length === 0 ? (
                                    <p className="msg-rail-empty">{emptyLobby}</p>
                                ) : lobbyRooms.map((room) => {
                                    const members = (room.memberEmails || []).map((e) => String(e || "").trim().toLowerCase()).filter(Boolean);
                                    const active = openRoom === room.id;
                                    const channelAvatar = !room.isDirect
                                        ? (members
                                            .map((email) => profileByEmail.get(email)?.avatar)
                                            .find((src) => hasHttpAvatar(src)) || "")
                                        : room.avatar;
                                    return (
                                        <div
                                            role="listitem"
                                            key={room.id}
                                            className={`msg-room-row${active ? " is-active" : ""}${room.isDirect ? " is-direct" : ""}`}
                                            style={{ "--room-hue": roomHue(room.id) }}
                                            tabIndex={0}
                                            aria-current={active ? "true" : undefined}
                                            onClick={() => openChat(room.id)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter" || e.key === " ") {
                                                    e.preventDefault();
                                                    openChat(room.id);
                                                }
                                            }}
                                        >
                                            <AvatarFace
                                                src={channelAvatar}
                                                name={room.label}
                                                className="msg-room-avatar"
                                            />
                                            <span className="msg-room-copy">
                                                <span className="msg-room-line">
                                                    <span className="msg-room-name">{room.label}</span>
                                                    <span className="msg-room-time">{room.lastStamp?.time || ""}</span>
                                                </span>
                                                <span className="msg-room-preview">{room.preview}</span>
                                            </span>
                                            <span
                                                className="msg-room-menu"
                                                onClick={(e) => e.stopPropagation()}
                                                onKeyDown={(e) => e.stopPropagation()}
                                            >
                                                <ItemMenu
                                                    title={`${room.label} options`}
                                                    icon="fa-solid fa-ellipsis-vertical"
                                                    items={[
                                                        { label: "Clear chat", onClick: () => clearChat(room.id) },
                                                        { label: "Delete chat", onClick: () => deleteChat(room.id), danger: true },
                                                    ]}
                                                />
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </aside>
                        <section className="msg-stage" aria-label={openRoom ? activeMeta.label : "Chat"}>
                            {openRoom ? (
                                <div className="msg-chat">
                                    <div className="msg-chat-header">
                                        <button type="button" className="msg-back-btn" onClick={leaveChat} aria-label="Back to rooms">
                                            <i className="fa-solid fa-chevron-left" aria-hidden></i>
                                        </button>
                                        {openRoomMembers.length ? (
                                            <div className="msg-faces" aria-hidden>
                                                {openRoomMembers.map((m) => (
                                                    <AvatarFace
                                                        key={m.email}
                                                        src={m.avatar}
                                                        name={m.label}
                                                        className="msg-face"
                                                    />
                                                ))}
                                            </div>
                                        ) : (
                                            <AvatarFace
                                                src={isDm ? (profileByEmail.get(dmOtherEmail)?.avatar || "") : ""}
                                                name={isLegacyDirect ? "DM" : activeMeta.label}
                                                className="msg-face msg-face-solo"
                                            />
                                        )}
                                        <div className="msg-chat-titles">
                                            <h3>{activeMeta.label}</h3>
                                            {identityReady && isDm ? null : (
                                                <p>
                                                    {identityReady
                                                        ? (isLegacyDirect
                                                            ? "legacy inbox · you pick who sees it"
                                                            : `${composeMemberCount || 0} in the room`)
                                                        : "unlocking this device…"}
                                                </p>
                                            )}
                                            {deviceKeyDrift ? (
                                                <p className="msg-key-drift">This browser’s key differs from the published one. New mail is sealed to this device; older mail may not open until you use the original browser.</p>
                                            ) : null}
                                        </div>
                                        <CloseModuleBtn onClick={closeModule} />
                                    </div>
                                    <div className="msg-thread" role="log" aria-live="polite" aria-relevant="additions">
                                        {threadMsgs.length === 0 ? (
                                            <div className="msg-thread-empty">
                                                <div className="msg-seal" aria-hidden><span>SEAL</span></div>
                                                <h3>{isDm || isLegacyDirect ? "quiet for now" : "say it"}</h3>
                                                <p>{emptyThread}</p>
                                            </div>
                                        ) : threadMsgs.map(renderBubble)}
                                        <div ref={threadEndRef} />
                                    </div>
                                    <div className={`msg-composer${editId ? " is-editing" : ""}`}>
                                        {isLegacyDirect && !editId ? (
                                            <>
                                                <label className="msg-send-to-label">Send to</label>
                                                <RecipientPicker
                                                    users={users}
                                                    actorEmail={actorEmail}
                                                    identityPub={identityPub}
                                                    selected={composeSelected}
                                                    onToggle={(email) => setComposeSelected((prev) => ({ ...prev, [email]: !prev[email] }))}
                                                />
                                            </>
                                        ) : null}
                                        {editId ? (
                                            <div className="msg-edit-banner" aria-live="polite">
                                                <i className="fa-solid fa-pen" aria-hidden></i>
                                                <span>Editing message</span>
                                            </div>
                                        ) : null}
                                        <div className="msg-composer-row">
                                            {editId ? (
                                                <button
                                                    type="button"
                                                    className="msg-edit-cancel"
                                                    onClick={cancelEdit}
                                                    aria-label="Cancel edit"
                                                    title="Cancel"
                                                >
                                                    <i className="fa-solid fa-xmark" aria-hidden></i>
                                                </button>
                                            ) : null}
                                            <RteEditor
                                                compact
                                                seedKey={composeSeed}
                                                initialHtml={editId ? editDraftHtml : ""}
                                                placeholder={editId ? "Edit message…" : "say something…"}
                                                editorRef={composeEditorRef}
                                                onKeyDown={onComposerKeyDown}
                                            />
                                            <BusyButton
                                                type="button"
                                                className={`msg-send-btn${editId ? " is-confirm" : ""}`}
                                                busy={formBusy}
                                                busyLabel=""
                                                onClick={editId ? saveEditMessage : sendFromComposer}
                                                aria-label={formBusy ? (editId ? "Saving edit" : "Sending") : (editId ? "Save edit" : "Send")}
                                            >
                                                <i className={`fa-solid ${editId ? "fa-check" : "fa-arrow-up"}`} aria-hidden></i>
                                            </BusyButton>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="msg-stage-idle">
                                    <CloseModuleBtn onClick={closeModule} />
                                    <div className="msg-stage-empty">
                                        <div className="msg-seal" aria-hidden><span>SEAL</span></div>
                                        <h3>pick a room</h3>
                                        <p>Channels and Direct sit on the left. Open one to talk.</p>
                                    </div>
                                </div>
                            )}
                        </section>
                    </div>
                )}
            </div>

            <ModuleModal open={newDmOpen} shown={newDmShown} onBackdrop={() => closeModal(setNewDmOpen, setNewDmShown)}>
                <div className="modal-content msg-new-dm-modal">
                    <div className="modal-header">
                        <h3 style={{ margin: "0 auto", color: ACCENT }}>New direct</h3>
                        <span className="close-btn" onClick={() => closeModal(setNewDmOpen, setNewDmShown)}>&times;</span>
                    </div>
                    <div className="modal-body">
                        <DmPersonPick
                            users={users}
                            actorEmail={actorEmail}
                            identityPub={identityPub}
                            onPick={(email) => startDirectWith(email)}
                        />
                    </div>
                </div>
            </ModuleModal>
        </div>
    );
}
