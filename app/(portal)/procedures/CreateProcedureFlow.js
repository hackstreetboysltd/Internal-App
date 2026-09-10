"use client";

import CreateReviewFlow, {
  CreateReviewField,
  CreateReviewRow,
} from "@/components/CreateReviewFlow";
import StepsEditor from "./StepsEditor";

const STEPS = [
  {
    id: "details",
    title: "Procedure details",
    hint: "Name the guide and add execution steps.",
  },
  {
    id: "review",
    title: "Review procedure",
    hint: "Confirm how this runbook will appear before publishing.",
  },
];

export default function CreateProcedureFlow({
  author,
  setAuthor,
  title,
  setTitle,
  steps,
  setSteps,
  busy,
  onClose,
  onSubmit,
}) {
  const cleanedSteps = (Array.isArray(steps) ? steps : [])
    .map((s) => String(s || "").trim())
    .filter(Boolean);

  const validateDetails = () => {
    if (!author.trim()) return "Your name is required.";
    if (!title.trim()) return "Guide title is required.";
    if (cleanedSteps.length === 0) return "At least one execution step is required.";
    return null;
  };

  const trimmedAuthor = author.trim();
  const trimmedTitle = title.trim();

  return (
    <CreateReviewFlow
      className="procedures-create-flow"
      steps={STEPS}
      busy={busy}
      submitLabel="Publish Procedure"
      busyLabel="Publishing…"
      titleId="create-procedure-flow-title"
      validateDetails={validateDetails}
      onClose={onClose}
      onSubmit={onSubmit}
      renderDetails={() => (
        <>
          <CreateReviewField label="Your Name" htmlFor="procAuthor">
            <input
              type="text"
              id="procAuthor"
              placeholder="e.g. Alice"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              required
              autoComplete="off"
            />
          </CreateReviewField>
          <CreateReviewField label="Guide Title" htmlFor="procTitle">
            <input
              type="text"
              id="procTitle"
              placeholder="e.g. Setting up a new staging workspace"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              autoComplete="off"
            />
          </CreateReviewField>
          <CreateReviewField label="Execution Steps">
            <StepsEditor steps={steps} setSteps={setSteps} inputId="newProcStepInput" />
          </CreateReviewField>
        </>
      )}
      renderReview={() => (
        <div className="create-review-details">
          <CreateReviewRow label="Author" value={trimmedAuthor || "—"} />
          <CreateReviewRow label="Title" value={trimmedTitle || "—"} />
          <CreateReviewRow label="Steps">
            {cleanedSteps.length === 0 ? (
              "—"
            ) : (
              <ol style={{ margin: 0, paddingLeft: 18 }}>
                {cleanedSteps.map((step, idx) => (
                  <li key={`${idx}-${step.slice(0, 24)}`}>{step}</li>
                ))}
              </ol>
            )}
          </CreateReviewRow>
        </div>
      )}
    />
  );
}
