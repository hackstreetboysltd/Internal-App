"use client";

import CreateReviewFlow, {
  CreateReviewField,
  CreateReviewRow,
} from "@/components/CreateReviewFlow";

const STEPS = [
  {
    id: "details",
    title: "Meeting details",
    hint: "Organizer, time, join link, and agenda.",
  },
  {
    id: "review",
    title: "Review meeting",
    hint: "Confirm the meeting before scheduling it.",
  },
];

export default function CreateMeetingFlow({
  author,
  setAuthor,
  time,
  setTime,
  link,
  setLink,
  agenda,
  setAgenda,
  busy,
  onClose,
  onSubmit,
}) {
  const validateDetails = () => {
    if (!String(author || "").trim()) return "Your name is required.";
    if (!String(time || "").trim()) return "Date and time are required.";
    if (!String(link || "").trim()) return "Meeting URL is required.";
    if (!String(agenda || "").trim()) return "Meeting agenda is required.";
    return null;
  };

  const trimmedAuthor = String(author || "").trim();
  const trimmedTime = String(time || "").trim();
  const trimmedLink = String(link || "").trim();
  const trimmedAgenda = String(agenda || "").trim();
  const timeLabel = trimmedTime
    ? new Date(trimmedTime).toLocaleString(undefined, {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  return (
    <CreateReviewFlow
      className="calendar-create-meeting-flow"
      steps={STEPS}
      busy={busy}
      submitLabel="Schedule Meeting"
      busyLabel="Scheduling…"
      titleId="create-meeting-flow-title"
      validateDetails={validateDetails}
      onClose={onClose}
      onSubmit={onSubmit}
      renderDetails={() => (
        <>
          <CreateReviewField label="Your Name" htmlFor="createMAuthor">
            <input
              type="text"
              id="createMAuthor"
              placeholder="e.g. Alice"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              required
              autoComplete="off"
            />
          </CreateReviewField>
          <CreateReviewField label="Date & Time" htmlFor="createMTime">
            <input
              type="datetime-local"
              id="createMTime"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              required
            />
          </CreateReviewField>
          <CreateReviewField label="Meeting URL" htmlFor="createMLink">
            <input
              type="url"
              id="createMLink"
              placeholder="e.g. https://meet.google.com/abc-defg-hij"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              required
              autoComplete="off"
            />
          </CreateReviewField>
          <CreateReviewField label="Meeting Agenda" htmlFor="createMAgenda">
            <textarea
              id="createMAgenda"
              rows={4}
              placeholder="Specify key topics and goals..."
              value={agenda}
              onChange={(e) => setAgenda(e.target.value)}
              required
            />
          </CreateReviewField>
        </>
      )}
      renderReview={() => (
        <div className="create-review-details">
          <CreateReviewRow label="Organizer" value={trimmedAuthor || "—"} />
          <CreateReviewRow label="Date & time" value={timeLabel} />
          <CreateReviewRow label="Meeting URL" value={trimmedLink || "—"} />
          <CreateReviewRow label="Agenda" value={trimmedAgenda || "—"} />
        </div>
      )}
    />
  );
}
