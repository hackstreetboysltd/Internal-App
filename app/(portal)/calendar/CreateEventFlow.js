"use client";

import CreateReviewFlow, {
  CreateReviewField,
  CreateReviewRow,
} from "@/components/CreateReviewFlow";

const STEPS = [
  {
    id: "details",
    title: "Event details",
    hint: "Organizer, title, date, and location.",
  },
  {
    id: "review",
    title: "Review event",
    hint: "Confirm the event before adding it to the calendar.",
  },
];

export default function CreateEventFlow({
  author,
  setAuthor,
  title,
  setTitle,
  date,
  setDate,
  loc,
  setLoc,
  busy,
  onClose,
  onSubmit,
}) {
  const validateDetails = () => {
    if (!String(author || "").trim()) return "Organizer name is required.";
    if (!String(title || "").trim()) return "Event name is required.";
    if (!String(date || "").trim()) return "Event date is required.";
    if (!String(loc || "").trim()) return "Location or virtual link is required.";
    return null;
  };

  const trimmedAuthor = String(author || "").trim();
  const trimmedTitle = String(title || "").trim();
  const trimmedDate = String(date || "").trim();
  const trimmedLoc = String(loc || "").trim();
  const dateLabel = trimmedDate
    ? new Date(trimmedDate + "T00:00:00").toLocaleDateString(undefined, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "—";

  return (
    <CreateReviewFlow
      className="calendar-create-event-flow"
      steps={STEPS}
      busy={busy}
      submitLabel="Add to Calendar"
      busyLabel="Adding…"
      titleId="create-event-flow-title"
      validateDetails={validateDetails}
      onClose={onClose}
      onSubmit={onSubmit}
      renderDetails={() => (
        <>
          <CreateReviewField label="Organizer Name" htmlFor="createEvAuthor">
            <input
              type="text"
              id="createEvAuthor"
              placeholder="e.g. Alice"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              required
              autoComplete="off"
            />
          </CreateReviewField>
          <CreateReviewField label="Event Name" htmlFor="createEvTitle">
            <input
              type="text"
              id="createEvTitle"
              placeholder="e.g. Q3 All Hands Sync"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              autoComplete="off"
            />
          </CreateReviewField>
          <CreateReviewField label="Event Date" htmlFor="createEvDate">
            <input
              type="date"
              id="createEvDate"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </CreateReviewField>
          <CreateReviewField label="Location / Virtual Link" htmlFor="createEvLoc">
            <input
              type="text"
              id="createEvLoc"
              placeholder="e.g. Google Meet URL or conference room name"
              value={loc}
              onChange={(e) => setLoc(e.target.value)}
              required
              autoComplete="off"
            />
          </CreateReviewField>
        </>
      )}
      renderReview={() => (
        <div className="create-review-details">
          <CreateReviewRow label="Organizer" value={trimmedAuthor || "—"} />
          <CreateReviewRow label="Event name" value={trimmedTitle || "—"} />
          <CreateReviewRow label="Date" value={dateLabel} />
          <CreateReviewRow label="Location / link" value={trimmedLoc || "—"} />
        </div>
      )}
    />
  );
}
