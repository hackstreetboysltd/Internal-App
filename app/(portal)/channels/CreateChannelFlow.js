"use client";

import { useMemo } from "react";
import CreateReviewFlow, {
  CreateReviewField,
  CreateReviewRow,
} from "@/components/CreateReviewFlow";
import { normalizeEmail } from "@/lib/normalize";
import { RESERVED_CHANNEL_IDS, slugifyChannelName, uniqueChannelSlug } from "@/lib/channels";

const STEPS = [
  {
    id: "details",
    title: "Channel details",
    hint: "Name the channel, describe it, and pick members.",
  },
  {
    id: "review",
    title: "Review channel",
    hint: "Confirm membership before saving.",
  },
];

/**
 * @param {{ email?: string, name?: string }[]} profiles
 * @param {string[]} selected
 * @param {(emails: string[]) => void} onChange
 */
function MemberPicker({ profiles, selected, onChange }) {
  const selectedSet = useMemo(
    () => new Set((selected || []).map((e) => normalizeEmail(e))),
    [selected],
  );
  const sorted = useMemo(() => {
    return (Array.isArray(profiles) ? profiles : [])
      .filter((p) => p && normalizeEmail(p.email))
      .slice()
      .sort((a, b) => String(a.name || a.email).localeCompare(String(b.name || b.email)));
  }, [profiles]);

  const toggle = (email) => {
    const key = normalizeEmail(email);
    if (!key) return;
    const next = new Set(selectedSet);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange([...next]);
  };

  return (
    <div className="channel-member-picker">
      {sorted.length === 0 ? (
        <p className="channel-member-picker__empty">No profiles available yet.</p>
      ) : (
        <ul className="channel-member-picker__list">
          {sorted.map((p) => {
            const email = normalizeEmail(p.email);
            const checked = selectedSet.has(email);
            return (
              <li key={email}>
                <label className={`channel-member-picker__row${checked ? " is-selected" : ""}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(email)}
                  />
                  <span>
                    <strong>{p.name || email}</strong>
                    <span className="channel-member-picker__email">{email}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function CreateChannelFlow({
  mode = "create",
  name,
  setName,
  description,
  setDescription,
  memberEmails,
  setMemberEmails,
  profiles,
  existingChannels,
  excludeId = null,
  busy,
  onClose,
  onSubmit,
}) {
  const validateDetails = () => {
    if (!String(name || "").trim()) return "Channel name is required.";
    const slug = uniqueChannelSlug(slugifyChannelName(name), existingChannels, excludeId);
    if (RESERVED_CHANNEL_IDS.has(slug)) {
      return `"${slug}" is reserved for Direct messages.`;
    }
    if (!Array.isArray(memberEmails) || memberEmails.length === 0) {
      return "Select at least one member.";
    }
    return null;
  };

  const trimmedName = String(name || "").trim();
  const trimmedDesc = String(description || "").trim();
  const slugPreview =
    mode === "edit" && excludeId
      ? String(excludeId)
      : uniqueChannelSlug(slugifyChannelName(trimmedName || "channel"), existingChannels, excludeId);
  const memberLabels = (memberEmails || []).map((email) => {
    const profile = (profiles || []).find((p) => normalizeEmail(p.email) === normalizeEmail(email));
    return profile?.name ? `${profile.name} (${email})` : email;
  });

  return (
    <CreateReviewFlow
      className="channels-create-flow"
      steps={STEPS}
      busy={busy}
      submitLabel={mode === "edit" ? "Save channel" : "Create channel"}
      busyLabel={mode === "edit" ? "Saving…" : "Creating…"}
      titleId="create-channel-flow-title"
      validateDetails={validateDetails}
      onClose={onClose}
      onSubmit={onSubmit}
      renderDetails={() => (
        <>
          <CreateReviewField label="Channel name" htmlFor="channelName">
            <input
              id="channelName"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Leadership"
              autoComplete="off"
              required
            />
          </CreateReviewField>
          <CreateReviewField label="Description (optional)" htmlFor="channelDescription">
            <textarea
              id="channelDescription"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this channel is for"
            />
          </CreateReviewField>
          <CreateReviewField label="Members">
            <MemberPicker
              profiles={profiles}
              selected={memberEmails}
              onChange={setMemberEmails}
            />
          </CreateReviewField>
        </>
      )}
      renderReview={() => (
        <div className="create-review-details">
          <CreateReviewRow label="Name" value={trimmedName} />
          <CreateReviewRow label="Slug" value={slugPreview} />
          <CreateReviewRow label="Description" value={trimmedDesc || "—"} />
          <CreateReviewRow label="Members" value={memberLabels.join(", ") || "—"} />
        </div>
      )}
    />
  );
}
