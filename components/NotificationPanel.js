'use client';

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  describeNotificationRow,
  fetchNotifications,
  hrefForNotificationLink,
  markNotificationsRead,
} from "@/lib/notificationsClient";

const MODULE_TONE = {
  Goals: { chip: "#fb7185", glow: "rgba(251, 113, 133, 0.18)" },
  Skills: { chip: "#a78bfa", glow: "rgba(167, 139, 250, 0.18)" },
  Procedures: { chip: "#38bdf8", glow: "rgba(56, 189, 248, 0.18)" },
  Apps: { chip: "#34d399", glow: "rgba(52, 211, 153, 0.18)" },
  Calendar: { chip: "#fbbf24", glow: "rgba(251, 191, 36, 0.18)" },
  Documents: { chip: "#94a3b8", glow: "rgba(148, 163, 184, 0.18)" },
};

function formatWhen(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 60_000) return "Just now";
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatApprovalStamp(iso) {
  if (!iso) return { primary: "Date unknown", secondary: "" };
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { primary: "Date unknown", secondary: "" };
  const diffMs = Date.now() - date.getTime();
  const primary = date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  if (diffMs < 60_000) return { primary: "Just now", secondary: primary };
  if (diffMs < 86_400_000) {
    const relative = diffMs < 3_600_000
      ? `${Math.floor(diffMs / 60_000)}m ago`
      : `${Math.floor(diffMs / 3_600_000)}h ago`;
    return { primary: relative, secondary: primary };
  }
  return { primary, secondary: "" };
}

function moduleTone(moduleName) {
  return MODULE_TONE[String(moduleName)] || { chip: "#818cf8", glow: "rgba(129, 140, 248, 0.18)" };
}

function msFromIso(iso) {
  const parsed = Date.parse(String(iso || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function actorLabel(row) {
  const email = row.actor_email ? String(row.actor_email).trim() : "";
  const name = String(row.actor_name || "").trim();
  if (email && name && email.toLowerCase() !== name.toLowerCase()) return name;
  return email || name || "Team member";
}

/** Group by server batch_key (owner + horizon + period for goals). Singles stay singles. */
function groupApprovalItems(items) {
  /** @type {Map<string, Array<Record<string, unknown>>>} */
  const batches = new Map();
  /** @type {Array<Record<string, unknown>>} */
  const unbatched = [];

  for (const item of items) {
    const key = item.batch_key ? String(item.batch_key) : "";
    if (!key) {
      unbatched.push(item);
      continue;
    }
    const bucket = batches.get(key) || [];
    bucket.push(item);
    batches.set(key, bucket);
  }

  /** @type {Array<{ type: "batch" | "single", key?: string, items?: Array<Record<string, unknown>>, item?: Record<string, unknown>, sortMs: number }>} */
  const grouped = [];

  for (const [key, batchItems] of batches) {
    batchItems.sort((a, b) => msFromIso(b.created_at) - msFromIso(a.created_at));
    const sortMs = Math.max(...batchItems.map((row) => msFromIso(row.created_at)));
    if (batchItems.length > 1) {
      grouped.push({ type: "batch", key, items: batchItems, sortMs });
    } else {
      grouped.push({ type: "single", item: batchItems[0], sortMs });
    }
  }

  for (const item of unbatched) {
    grouped.push({ type: "single", item, sortMs: msFromIso(item.created_at) });
  }

  grouped.sort((a, b) => b.sortMs - a.sortMs);
  return grouped;
}

function ApprovalCard({ row, onNavigate, nested = false }) {
  const href = hrefForNotificationLink(row.link_path);
  const tone = moduleTone(row.module);
  const stamp = formatApprovalStamp(String(row.created_at || ""));
  const title = String(row.item_name || "Untitled");
  const actorEmail = row.actor_email ? String(row.actor_email) : "";
  const actorName = String(row.actor_name || "");
  const showEmail = actorEmail && actorEmail.toLowerCase() !== actorName.toLowerCase();
  const isGoalReview = row.approval_kind === "goal_review";

  return (
    <article className={`approval-panel-card${nested ? " is-nested" : ""}`} data-testid={nested ? "approval-batch-item" : "approval-single"}>
      <div className="approval-panel-card-head">
        <span
          className="approval-panel-module-chip"
          style={{ color: tone.chip, background: tone.glow, borderColor: `${tone.chip}33` }}
        >
          {row.module}
        </span>
        <time className="approval-panel-stamp" dateTime={String(row.created_at || "")} title={stamp.secondary || stamp.primary}>
          {stamp.primary}
        </time>
      </div>

      <p className="approval-panel-title">{title}</p>

      <div className="approval-panel-meta">
        {showEmail ? (
          <span className="approval-panel-email">{actorEmail}</span>
        ) : (
          <span className="approval-panel-email">{actorName}</span>
        )}
        <span className={`approval-panel-status${isGoalReview ? " is-review" : " is-pending"}`}>
          {isGoalReview ? "Under review" : String(row.action || "Awaiting approval")}
        </span>
      </div>

      {href ? (
        <Link
          href={href}
          className="approval-panel-link"
          onClick={(event) => {
            event.stopPropagation();
            onNavigate();
          }}
        >
          Review in {row.module}
          <i className="fa-solid fa-arrow-right" aria-hidden="true" />
        </Link>
      ) : null}
    </article>
  );
}

function ApprovalBatchAccordion({ batchItems, onNavigate }) {
  const [open, setOpen] = useState(false);
  const first = batchItems[0];
  const tone = moduleTone(first.module);
  const batchIso = String(first.created_at || "");
  const stamp = formatApprovalStamp(batchIso);
  const href = hrefForNotificationLink(first.link_path);
  const isGoalReview = batchItems.every((row) => row.approval_kind === "goal_review");
  const count = batchItems.length;
  const timeLabel = stamp.secondary || stamp.primary;
  const batchLabel = String(first.batch_label || `${count} goals completed`);
  const person = actorLabel(first);
  const statusLabel = isGoalReview ? "Under review" : String(first.action || "Awaiting approval");

  return (
    <article
      className={`approval-panel-batch${open ? " is-open" : ""}`}
      data-testid="approval-batch"
      data-batch-count={count}
    >
      <button
        type="button"
        className="approval-panel-batch-trigger"
        aria-expanded={open}
        aria-label={`${batchLabel}, ${count} items. ${open ? "Collapse" : "Expand"} batch.`}
        onClick={() => setOpen((value) => !value)}
      >
        <div className="approval-panel-batch-trigger-top">
          <span
            className="approval-panel-module-chip"
            style={{ color: tone.chip, background: tone.glow, borderColor: `${tone.chip}33` }}
          >
            {first.module}
          </span>
          <time className="approval-panel-stamp" dateTime={batchIso} title={timeLabel}>
            {stamp.primary}
          </time>
        </div>

        <p className="approval-panel-batch-title">{batchLabel}</p>
        <p className="approval-panel-batch-sub">
          {person} · {count} goal{count === 1 ? "" : "s"}
        </p>

        <div className="approval-panel-batch-footer">
          <span className={`approval-panel-status${isGoalReview ? " is-review" : " is-pending"}`}>
            {statusLabel}
          </span>
          <span className="approval-panel-batch-hint">{open ? "Hide" : "Show all"}</span>
          <span className="approval-panel-batch-count">{count}</span>
          <i className={`fa-solid fa-chevron-down approval-panel-batch-chevron${open ? " is-open" : ""}`} aria-hidden="true" />
        </div>
      </button>

      {open ? (
        <div className="approval-panel-batch-body">
          {batchItems.map((row) => (
            <ApprovalCard key={String(row.id)} row={row} onNavigate={onNavigate} nested />
          ))}
          {href ? (
            <Link href={href} className="approval-panel-link approval-panel-batch-link" onClick={() => onNavigate()}>
              Review all in {first.module}
              <i className="fa-solid fa-arrow-right" aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export default function NotificationPanel({
  open,
  onClose,
  refreshToken = 0,
}) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [approvalQueue, setApprovalQueue] = useState(false);
  const panelRef = useRef(null);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchNotifications();
      setItems(Array.isArray(data.notifications) ? data.notifications : []);
      setUnreadCount(Number(data.unreadCount) || 0);
      setApprovalQueue(data.approvalQueue === true);
    } catch (err) {
      console.warn("Could not load notifications:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    queueMicrotask(async () => {
      if (cancelled) return;
      await loadItems();
    });
    return () => {
      cancelled = true;
    };
  }, [open, loadItems, refreshToken]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const markAllRead = async () => {
    if (approvalQueue) return;
    try {
      const result = await markNotificationsRead();
      setUnreadCount(Number(result.unreadCount) || 0);
      setItems((current) => current.map((row) => ({ ...row, read: true })));
    } catch (err) {
      console.warn("Could not mark notifications read:", err);
    }
  };

  const markOneRead = async (id) => {
    if (approvalQueue || !id) return;
    try {
      const result = await markNotificationsRead([String(id)]);
      setUnreadCount(Number(result.unreadCount) || 0);
      setItems((current) => current.map((row) => (
        String(row.id) === String(id) ? { ...row, read: true } : row
      )));
    } catch (err) {
      console.warn("Could not mark notification read:", err);
    }
  };

  if (!open) return null;

  const groupedApprovals = approvalQueue && !loading ? groupApprovalItems(items) : [];
  const batchCount = groupedApprovals.filter((entry) => entry.type === "batch").length;

  return (
    <>
      <button
        type="button"
        aria-label="Close notifications"
        className="notification-panel-backdrop"
        onClick={onClose}
      />
      <aside
        ref={panelRef}
        className={`notification-panel${approvalQueue ? " is-approval-queue" : ""}`}
        role="dialog"
        aria-label={approvalQueue ? "Awaiting approval" : "Notifications"}
        aria-modal="true"
      >
        <div className="notification-panel-header">
          <div>
            <h2>{approvalQueue ? "Awaiting approval" : "Notifications"}</h2>
            <p>
              {approvalQueue
                ? (unreadCount
                  ? (batchCount > 0
                    ? `${batchCount} batch${batchCount === 1 ? "" : "es"} · ${unreadCount} items need review`
                    : `${unreadCount} item${unreadCount === 1 ? "" : "s"} need review`)
                  : "Nothing awaiting approval")
                : (unreadCount ? `${unreadCount} unread` : "You are caught up")}
            </p>
          </div>
          <div className="notification-panel-actions">
            {!approvalQueue ? (
              <button type="button" className="notification-panel-link" onClick={markAllRead}>
                Mark all read
              </button>
            ) : null}
            <button type="button" className="notification-panel-close" onClick={onClose} aria-label="Close">
              <i className="fa-solid fa-xmark" />
            </button>
          </div>
        </div>

        <div className="notification-panel-list" aria-live="polite">
          {loading ? <p className="notification-panel-empty">Loading…</p> : null}
          {!loading && items.length === 0 ? (
            <p className="notification-panel-empty">
              {approvalQueue
                ? "No submissions or completed goals awaiting approval."
                : "No activity yet. Team changes will show up here."}
            </p>
          ) : null}
          {!loading && approvalQueue
            ? groupedApprovals.map((entry) => {
              if (entry.type === "batch" && entry.items) {
                return (
                  <ApprovalBatchAccordion
                    key={entry.key}
                    batchItems={entry.items}
                    onNavigate={onClose}
                  />
                );
              }
              return (
                <ApprovalCard
                  key={String(entry.item?.id)}
                  row={entry.item}
                  onNavigate={onClose}
                />
              );
            })
            : null}
          {!loading && !approvalQueue
            ? items.map((row) => {
              const unread = !row.read;
              const href = hrefForNotificationLink(row.link_path);
              const actionText = describeNotificationRow(row);
              return (
                <article
                  key={String(row.id)}
                  className={`notification-panel-item${unread ? " is-unread" : ""}`}
                  onClick={() => {
                    if (unread) markOneRead(String(row.id));
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && unread) markOneRead(String(row.id));
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="notification-panel-item-top">
                    <span className="notification-panel-module">{row.module}</span>
                    <time dateTime={String(row.created_at)}>{formatWhen(String(row.created_at))}</time>
                  </div>
                  <p>{actionText}</p>
                  {href ? (
                    <Link
                      href={href}
                      className="notification-panel-open-link"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (unread) markOneRead(String(row.id));
                        onClose();
                      }}
                    >
                      Open {row.module}
                    </Link>
                  ) : null}
                </article>
              );
            })
            : null}
        </div>
      </aside>
    </>
  );
}

export { useNotificationStream } from "@/lib/notificationsClient";
