"use client";

import CreateReviewFlow, {
  CreateReviewField,
  CreateReviewRow,
} from "@/components/CreateReviewFlow";
import { itemsLabelForType } from "./goalsHelpers";

const STEPS = [
  {
    id: "details",
    title: "New goal",
    hint: "Set the horizon and add commitments.",
  },
  {
    id: "review",
    title: "Review goal",
    hint: "Confirm commitments before committing.",
  },
];

export default function CreateGoalFlow({
  horizon,
  setHorizon,
  horizonOptions,
  draftItems,
  editingKey,
  editText,
  goalEditor,
  draftList,
  isAdminView = false,
  scope,
  setScope,
  assigneeEmail,
  setAssigneeEmail,
  assigneeOptions = [],
  busy,
  onClose,
  onSubmit,
  onShowRequirements,
}) {
  const resolvedItems = (draftItems || [])
    .map((d) => (editingKey === d.key ? editText : d.text).trim())
    .filter(Boolean);

  const validateDetails = () => {
    if (resolvedItems.length < 1) return "You must add at least 1 goal/milestone.";
    if (resolvedItems.length > 15) return "A maximum of 15 goals/milestones is allowed.";
    if (isAdminView && scope === "personal" && !String(assigneeEmail || "").trim()) {
      return "Please select a profile to assign the goal to.";
    }
    return null;
  };

  const horizonLabel =
    (horizonOptions || []).find((o) => o.value === horizon)?.label || horizon || "—";

  return (
    <CreateReviewFlow
      className="goals-create-flow"
      steps={STEPS}
      busy={busy}
      submitLabel="Commit Goal"
      busyLabel="Saving…"
      titleId="create-goal-flow-title"
      validateDetails={validateDetails}
      onClose={onClose}
      onSubmit={onSubmit}
      renderDetails={() => (
        <>
          <CreateReviewField label="Goal horizon" htmlFor="createGoalHorizon">
            <select
              id="createGoalHorizon"
              value={horizon}
              onChange={(e) => setHorizon(e.target.value)}
            >
              {(horizonOptions || []).map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </CreateReviewField>

          <div className="create-review-field">
            <div className="create-review-field-label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span>{itemsLabelForType(horizon)}</span>
              {typeof onShowRequirements === "function" ? (
                <button
                  type="button"
                  className="create-review-icon-btn"
                  style={{ position: "static", width: 28, height: 28, fontSize: "0.85rem" }}
                  title="View goal requirements"
                  aria-label="View goal requirements"
                  onClick={onShowRequirements}
                >
                  <i className="fa-solid fa-circle-info" aria-hidden="true"></i>
                </button>
              ) : null}
            </div>
            {goalEditor}
            {draftList}
          </div>

          {isAdminView ? (
            <>
              <fieldset className="create-review-field" style={{ border: "none", padding: 0, margin: 0 }}>
                <legend className="create-review-field-label">Scope</legend>
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 24 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 0 }}>
                    <input
                      type="radio"
                      name="createGoalScope"
                      value="personal"
                      checked={scope === "personal"}
                      onChange={() => setScope("personal")}
                    />
                    <span>Personal</span>
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 0 }}>
                    <input
                      type="radio"
                      name="createGoalScope"
                      value="global"
                      checked={scope === "global"}
                      onChange={() => setScope("global")}
                    />
                    <span>Global</span>
                  </label>
                </div>
              </fieldset>
              {scope === "personal" ? (
                <CreateReviewField label="Assign goal to" htmlFor="createGoalAssignee">
                  <select
                    id="createGoalAssignee"
                    value={assigneeEmail}
                    onChange={(e) => setAssigneeEmail(e.target.value)}
                  >
                    {assigneeOptions.length === 0
                      ? <option value="">No users loaded</option>
                      : assigneeOptions.map((email) => (
                        <option key={email} value={email}>{email}</option>
                      ))}
                  </select>
                </CreateReviewField>
              ) : null}
            </>
          ) : null}
        </>
      )}
      renderReview={() => (
        <div className="create-review-details">
          <CreateReviewRow label="Horizon" value={horizonLabel} />
          <CreateReviewRow label="Commitments">
            {resolvedItems.length ? (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {resolvedItems.map((text, i) => (
                  <li key={`review-goal-${i}`}>{text}</li>
                ))}
              </ul>
            ) : "—"}
          </CreateReviewRow>
          {isAdminView ? (
            <>
              <CreateReviewRow label="Scope" value={scope === "global" ? "Global" : "Personal"} />
              {scope === "personal" ? (
                <CreateReviewRow label="Assignee" value={assigneeEmail || "—"} />
              ) : null}
            </>
          ) : null}
        </div>
      )}
    />
  );
}
