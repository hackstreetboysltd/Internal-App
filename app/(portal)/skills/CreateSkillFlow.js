"use client";

import CreateReviewFlow, {
  CreateReviewField,
  CreateReviewRow,
} from "@/components/CreateReviewFlow";

const STEPS = [
  {
    id: "details",
    title: "Skill details",
    hint: "Name the skill and write the guidance.",
  },
  {
    id: "review",
    title: "Review skill",
    hint: "Confirm how this skill will appear in the repository.",
  },
];

export default function CreateSkillFlow({
  contribName,
  setContribName,
  skillTitle,
  setSkillTitle,
  skillDesc,
  setSkillDesc,
  busy,
  onClose,
  onSubmit,
}) {
  const validateDetails = () => {
    if (!contribName.trim()) return "Your name is required.";
    if (!skillTitle.trim()) return "Skill title is required.";
    if (!skillDesc.trim()) return "Guidance details are required.";
    return null;
  };

  const trimmedAuthor = contribName.trim();
  const trimmedTitle = skillTitle.trim();
  const trimmedBody = skillDesc.trim();

  return (
    <CreateReviewFlow
      className="skills-create-flow"
      steps={STEPS}
      busy={busy}
      submitLabel="Publish Skill"
      busyLabel="Publishing…"
      titleId="create-skill-flow-title"
      validateDetails={validateDetails}
      onClose={onClose}
      onSubmit={onSubmit}
      renderDetails={() => (
        <>
          <CreateReviewField label="Your Name" htmlFor="contribName">
            <input
              type="text"
              id="contribName"
              placeholder="e.g. Alice"
              value={contribName}
              onChange={(e) => setContribName(e.target.value)}
              required
              autoComplete="off"
            />
          </CreateReviewField>
          <CreateReviewField label="Skill Title" htmlFor="skillTitle">
            <input
              type="text"
              id="skillTitle"
              placeholder="e.g. Clean Git Rebase Workflow"
              value={skillTitle}
              onChange={(e) => setSkillTitle(e.target.value)}
              required
              autoComplete="off"
            />
          </CreateReviewField>
          <CreateReviewField label="Guidance Details" htmlFor="skillDesc">
            <textarea
              id="skillDesc"
              placeholder="Describe the skills, commands, or advice clearly..."
              required
              value={skillDesc}
              onChange={(e) => setSkillDesc(e.target.value)}
              style={{ minHeight: 100 }}
            />
          </CreateReviewField>
        </>
      )}
      renderReview={() => (
        <div className="create-review-details">
          <CreateReviewRow label="Author" value={trimmedAuthor || "—"} />
          <CreateReviewRow label="Title" value={trimmedTitle || "—"} />
          <CreateReviewRow label="Guidance">
            <div style={{ whiteSpace: "pre-line" }}>{trimmedBody || "—"}</div>
          </CreateReviewRow>
        </div>
      )}
    />
  );
}
