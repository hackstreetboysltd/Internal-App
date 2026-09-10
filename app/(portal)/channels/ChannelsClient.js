"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { get, save, watch } from "@/lib/portalApi";
import { clearActiveModule, saveActiveModule, useSession } from "@/lib/session";
import { usePortalData } from "@/components/PortalDataProvider";
import { useBusy } from "@/lib/useBusy";
import ItemMenu from "@/components/ItemMenu";
import { normalizeEmail } from "@/lib/normalize";
import {
  RESERVED_CHANNEL_IDS,
  isDmChannel,
  slugifyChannelName,
  uniqueChannelSlug,
} from "@/lib/channels";
import CreateChannelFlow from "./CreateChannelFlow";

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

function SkelChannelCard() {
  return (
    <div className="skel-channel-card">
      <div className="skel-compact-top">
        <span className="skel-line w50"></span>
        <span className="skel-pill"></span>
      </div>
      <span className="skel-line w100"></span>
      <span className="skel-line w90"></span>
      <span className="skel-line w70"></span>
      <div className="skel-compact-top" style={{ marginTop: 4 }}>
        <span className="skel-pill"></span>
        <span className="skel-pill"></span>
      </div>
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

export default function ChannelsClient() {
  const router = useRouter();
  const { actor, isAdminView } = useSession();
  const { adminVisible } = usePortalData();
  const actorRef = useRef(actor);
  useEffect(() => {
    actorRef.current = actor;
  }, [actor]);

  const isAdmin = isAdminView && adminVisible;

  const [loading, setLoading] = useState(true);
  const [channels, setChannels] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshSpin, setRefreshSpin] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [infoShown, setInfoShown] = useState(false);
  const [flowOpen, setFlowOpen] = useState(false);
  const [flowMode, setFlowMode] = useState("create");
  const [editId, setEditId] = useState(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [memberEmails, setMemberEmails] = useState([]);
  const { busy: formBusy, runBusy: runFormBusy } = useBusy();

  const profileByEmail = useMemo(() => {
    /** @type {Map<string, { name?: string, email?: string }>} */
    const map = new Map();
    for (const p of Array.isArray(profiles) ? profiles : []) {
      const email = normalizeEmail(p?.email);
      if (email) map.set(email, p);
    }
    return map;
  }, [profiles]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ch, prof] = await Promise.all([
        get("channels", { admin: true }),
        get("profile", { admin: true }),
      ]);
      setChannels(Array.isArray(ch) ? ch : []);
      setProfiles(Array.isArray(prof) ? prof : []);
    } catch (e) {
      console.error(e);
      setChannels([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return undefined;
    load();
    const unsub = watch(
      "channels",
      (data) => setChannels(Array.isArray(data) ? data : []),
      { admin: true },
    );
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [isAdmin, load]);

  const q = searchQuery.trim().toLowerCase();
  const filtered = useMemo(() => {
    const list = channels
      .filter((ch) => !isDmChannel(ch))
      .slice()
      .sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id)));
    if (!q) return list;
    return list.filter((ch) => {
      const members = Array.isArray(ch.memberEmails) ? ch.memberEmails.join(" ") : "";
      const hay = `${ch.name || ""} ${ch.slug || ""} ${ch.id || ""} ${ch.description || ""} ${members}`.toLowerCase();
      return hay.includes(q);
    });
  }, [channels, q]);

  const closeModule = () => {
    clearActiveModule();
    router.push("/");
  };

  const openModal = (setOpen, setShown) => {
    setOpen(true);
    requestAnimationFrame(() => setShown(true));
  };

  const closeModal = (setOpen, setShown) => {
    setShown(false);
    setTimeout(() => setOpen(false), 200);
  };

  const refreshChannels = async () => {
    setRefreshSpin(true);
    try {
      await load();
    } finally {
      setTimeout(() => setRefreshSpin(false), 400);
    }
  };

  const openCreate = () => {
    const self = normalizeEmail(actorRef.current?.email);
    setFlowMode("create");
    setEditId(null);
    setName("");
    setDescription("");
    setMemberEmails(self ? [self] : []);
    setFlowOpen(true);
  };

  const openEdit = (channel) => {
    setFlowMode("edit");
    setEditId(String(channel.id));
    setName(channel.name || "");
    setDescription(channel.description || "");
    setMemberEmails(
      Array.isArray(channel.memberEmails)
        ? channel.memberEmails.map((e) => normalizeEmail(e)).filter(Boolean)
        : [],
    );
    setFlowOpen(true);
  };

  const persist = () =>
    runFormBusy(async () => {
      const trimmedName = name.trim();
      if (!trimmedName) return alert("Channel name is required.");
      const slug = uniqueChannelSlug(
        slugifyChannelName(trimmedName),
        channels,
        editId,
      );
      if (RESERVED_CHANNEL_IDS.has(slug)) {
        return alert(`"${slug}" is reserved.`);
      }
      const members = [...new Set(memberEmails.map((e) => normalizeEmail(e)).filter(Boolean))];
      if (!members.length) return alert("Select at least one member.");

      const current = actorRef.current || {};
      const list = await get("channels", { admin: true });
      const next = Array.isArray(list) ? list.slice() : [];
      const now = new Date().toISOString();

      if (flowMode === "edit" && editId) {
        const idx = next.findIndex((c) => String(c.id) === String(editId));
        if (idx < 0) return alert("Channel not found.");
        next[idx] = {
          ...next[idx],
          name: trimmedName,
          slug: next[idx].slug || editId,
          description: description.trim(),
          memberEmails: members,
          updatedAt: now,
        };
      } else {
        next.push({
          id: slug,
          slug,
          name: trimmedName,
          description: description.trim(),
          memberEmails: members,
          createdByEmail: normalizeEmail(current.email),
          createdAt: now,
          updatedAt: now,
          author: current.name || "",
          email: normalizeEmail(current.email),
        });
      }

      await save("channels", next, { admin: true });
      setChannels(next);
      setFlowOpen(false);
    });

  const deleteChannel = async (channel) => {
    if (!confirm(`Delete channel “${channel.name || channel.id}”?`)) return;
    const list = await get("channels", { admin: true });
    const next = (Array.isArray(list) ? list : []).filter(
      (c) => String(c.id) !== String(channel.id),
    );
    await save("channels", next, { admin: true });
    setChannels(next);
  };

  useEffect(() => {
    if (isAdmin) return undefined;
    // User mode: membership lives in Messages tabs, not this admin module.
    const t = setTimeout(() => {
      saveActiveModule("messages", "Messages", false);
      router.replace("/messages/");
    }, 50);
    return () => clearTimeout(t);
  }, [isAdmin, router]);

  if (!isAdmin) {
    return (
      <div className="channels-module">
        <div className="container">
          <div className="channels-gate">
            <p>Channels you belong to show up as rooms in Messages.</p>
            <button
              type="button"
              className="new-app-btn"
              onClick={() => {
                saveActiveModule("messages", "Messages", false);
                router.push("/messages/");
              }}
            >
              Open Messages
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="channels-module">
      <div className="container">
        <div
          className="header-container"
          style={{
            display: "grid",
            gridTemplateColumns: "40px 1fr auto",
            alignItems: "center",
            marginBottom: 24,
            borderBottom: "1px solid var(--border-color)",
            paddingBottom: 16,
          }}
        >
          <div></div>
          <h2
            style={{
              margin: "0 auto",
              borderBottom: "none",
              paddingBottom: 0,
              fontSize: "1.8rem",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            Communication Channels
            <IconBtn
              title="About this module"
              onClick={() => openModal(setInfoOpen, setInfoShown)}
              style={{ width: "auto", height: "auto", fontSize: "1rem" }}
              hoverScale={1.15}
            >
              <i className="fa-solid fa-circle-info"></i>
            </IconBtn>
          </h2>
          <div
            className="header-actions-right"
            style={{ display: "flex", alignItems: "center", gap: 4, justifySelf: "end" }}
          >
            <IconBtn className="refresh-btn" title="Refresh channels" onClick={refreshChannels}>
              <i className={`fa-solid fa-arrows-rotate${refreshSpin ? " fa-spin" : ""}`}></i>
            </IconBtn>
            <IconBtn className="close-module-btn" title="Close module" onClick={closeModule}>
              <i className="fa-solid fa-xmark"></i>
            </IconBtn>
          </div>
        </div>

        <div className="header-actions" style={{ marginBottom: 24 }}>
          <div className="search-input-wrapper">
            <input
              type="text"
              id="searchChannels"
              placeholder="Search keyword..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="header-actions-primary">
            <button type="button" className="new-app-btn" onClick={openCreate}>
              New Channel
            </button>
          </div>
        </div>

        {loading ? (
          <div className="channels-skeleton" aria-busy="true" aria-label="Loading channels">
            <SkelChannelCard />
            <SkelChannelCard />
            <SkelChannelCard />
            <SkelChannelCard />
            <SkelChannelCard />
            <SkelChannelCard />
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <p>
              {q
                ? "No channels match your search query."
                : "No channels yet. Create one so it appears in Messages for its members."}
            </p>
            {!q ? (
              <button type="button" className="new-app-btn" onClick={openCreate}>
                New Channel
              </button>
            ) : null}
          </div>
        ) : (
          <div className="channels-grid">
            {filtered.map((ch) => {
              const members = Array.isArray(ch.memberEmails)
                ? ch.memberEmails.map((e) => normalizeEmail(e)).filter(Boolean)
                : [];
              const visibleMembers = members.slice(0, 4);
              const overflow = members.length - visibleMembers.length;
              return (
                <div key={ch.id} className="card">
                  <div className="channel-card-top">
                    <h4 title={ch.name || ch.id}>
                      <span className="channel-card-title">{ch.name || ch.id}</span>
                      <span className="channel-card-slug">/{ch.slug || ch.id}</span>
                    </h4>
                    <div className="channel-card-actions">
                      <ItemMenu
                        items={[
                          { label: "Edit", onClick: () => openEdit(ch) },
                          {
                            label: "Delete",
                            onClick: () => deleteChannel(ch),
                            danger: true,
                          },
                        ]}
                      />
                    </div>
                  </div>

                  {ch.description ? (
                    <p className="channel-card-desc">{ch.description}</p>
                  ) : (
                    <p className="channel-card-desc" style={{ color: "#64748b" }}>
                      No description
                    </p>
                  )}

                  <div className="channel-card-meta">
                    <span className="meta-count">
                      <i className="fa-solid fa-users" aria-hidden></i>
                      {members.length} member{members.length === 1 ? "" : "s"}
                    </span>
                  </div>

                  <div className="channel-member-chips">
                    {visibleMembers.length === 0 ? (
                      <span className="channel-chip channel-chip--more">No members</span>
                    ) : (
                      visibleMembers.map((email) => {
                        const profile = profileByEmail.get(email);
                        const label = profile?.name || email;
                        return (
                          <span key={email} className="channel-chip" title={email}>
                            <span className="channel-chip-avatar">{initialsFor(label)}</span>
                            <span className="channel-chip-label">{label}</span>
                          </span>
                        );
                      })
                    )}
                    {overflow > 0 ? (
                      <span className="channel-chip channel-chip--more">+{overflow} more</span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {flowOpen ? (
        <CreateChannelFlow
          mode={flowMode}
          name={name}
          setName={setName}
          description={description}
          setDescription={setDescription}
          memberEmails={memberEmails}
          setMemberEmails={setMemberEmails}
          profiles={profiles}
          existingChannels={channels}
          excludeId={editId}
          busy={formBusy}
          onClose={() => setFlowOpen(false)}
          onSubmit={persist}
        />
      ) : null}

      <ModuleModal
        open={infoOpen}
        shown={infoShown}
        onBackdrop={() => closeModal(setInfoOpen, setInfoShown)}
      >
        <div className="modal-content">
          <div className="modal-header">
            <h3 style={{ margin: "0 auto", display: "flex", alignItems: "center", gap: 8 }}>
              <i className="fa-solid fa-sitemap" style={{ color: "#34d399" }}></i>
              Communication Channels
            </h3>
            <span className="close-btn" onClick={() => closeModal(setInfoOpen, setInfoShown)}>
              &times;
            </span>
          </div>
          <div className="modal-body" style={{ fontSize: "0.93rem", lineHeight: 1.65, color: "#9ca3af" }}>
            <div style={{ marginBottom: 20 }}>
              <h4
                style={{
                  color: "#34d399",
                  margin: "0 0 8px 0",
                  fontSize: "1rem",
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                }}
              >
                <i className="fa-solid fa-sitemap"></i> About this Module
              </h4>
              <p style={{ margin: 0 }}>
                Admin-managed messaging rooms. Create a channel, assign members, and Messages
                shows that room as a card to people on the list. Direct stays a separate private inbox.
              </p>
            </div>
            <div>
              <h4
                style={{
                  color: "#34d399",
                  margin: "0 0 10px 0",
                  fontSize: "1rem",
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                }}
              >
                <i className="fa-solid fa-list-check"></i> Key Actions
              </h4>
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 9,
                }}
              >
                <li style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <i className="fa-solid fa-circle-check" style={{ color: "#34d399", marginTop: 3, flexShrink: 0 }}></i>
                  <span>Search channels by name, slug, description, or member email.</span>
                </li>
                <li style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <i className="fa-solid fa-circle-check" style={{ color: "#34d399", marginTop: 3, flexShrink: 0 }}></i>
                  <span>Create or edit channels through a details → review flow with membership and security level.</span>
                </li>
                <li style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <i className="fa-solid fa-circle-check" style={{ color: "#34d399", marginTop: 3, flexShrink: 0 }}></i>
                  <span>Level B is general visibility; Level A is admin-oriented record ACL.</span>
                </li>
                <li style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <i className="fa-solid fa-circle-check" style={{ color: "#34d399", marginTop: 3, flexShrink: 0 }}></i>
                  <span>Only listed members receive sealed channel messages in the Messages module.</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </ModuleModal>
    </div>
  );
}
