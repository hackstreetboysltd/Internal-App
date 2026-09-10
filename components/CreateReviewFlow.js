"use client";

import { useEffect, useState } from "react";
import BusyButton from "@/components/BusyButton";
import "./CreateReviewFlow.css";

export function CreateReviewField({ label, htmlFor, children }) {
  return (
    <label className="create-review-field" htmlFor={htmlFor}>
      <span className="create-review-field-label">{label}</span>
      {children}
    </label>
  );
}

export function CreateReviewRow({ label, value, changed = false, children }) {
  return (
    <div className={`create-review-row${changed ? " create-review-row--changed" : ""}`}>
      <span className="create-review-row-label">{label}</span>
      <div className="create-review-row-value">
        {children ?? value}
        {changed ? <span className="create-review-row-badge">Updated</span> : null}
      </div>
    </div>
  );
}

const DEFAULT_STEPS = [
  {
    id: "details",
    title: "Details",
    hint: "Fill in the required fields.",
  },
  {
    id: "review",
    title: "Review",
    hint: "Confirm everything looks right before submitting.",
  },
];

/**
 * Shared create/edit sheet: details → review → submit.
 *
 * @param {object} props
 * @param {Array<{ id: string, title: string, hint?: string }>} [props.steps]
 * @param {() => (string | null | undefined)} [props.validateDetails]
 * @param {() => void} [props.onBeforeReview] Called after details validate, before advancing
 * @param {() => React.ReactNode} props.renderDetails
 * @param {() => React.ReactNode} props.renderReview
 * @param {() => void | Promise<void>} props.onSubmit
 * @param {() => void} props.onClose
 * @param {boolean} [props.busy]
 * @param {string} [props.submitLabel]
 * @param {string} [props.busyLabel]
 * @param {string} [props.titleId]
 * @param {string} [props.className]
 */
export default function CreateReviewFlow({
  steps = DEFAULT_STEPS,
  validateDetails,
  onBeforeReview,
  renderDetails,
  renderReview,
  onSubmit,
  onClose,
  busy = false,
  submitLabel = "Submit",
  busyLabel = "Saving…",
  titleId = "create-review-flow-title",
  className = "",
}) {
  const [step, setStep] = useState(0);
  const [error, setError] = useState(null);

  useEffect(() => {
    setStep(0);
    setError(null);
  }, []);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== "Escape" || busy) return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const flowSteps = Array.isArray(steps) && steps.length ? steps : DEFAULT_STEPS;
  const current = flowSteps[step] || flowSteps[0];
  const isLastStep = step >= flowSteps.length - 1;

  const runDetailsValidation = () => {
    if (typeof validateDetails !== "function") return null;
    const message = validateDetails();
    return message ? String(message) : null;
  };

  const goNext = () => {
    if (current.id === "details" || step === 0) {
      const stepError = runDetailsValidation();
      if (stepError) {
        setError(stepError);
        return;
      }
      if (typeof onBeforeReview === "function") onBeforeReview();
    }
    setError(null);
    setStep((s) => Math.min(s + 1, flowSteps.length - 1));
  };

  const goBack = () => {
    setError(null);
    setStep((s) => Math.max(s - 1, 0));
  };

  const handleSubmit = () => {
    const stepError = runDetailsValidation();
    if (stepError) {
      setStep(0);
      setError(stepError);
      return;
    }
    setError(null);
    onSubmit();
  };

  return (
    <div
      className={`create-review-flow${className ? ` ${className}` : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="create-review-flow-sheet">
        <div className="create-review-flow-header">
          <div className="create-review-flow-header-row">
            <div className="create-review-flow-heading">
              <h1 id={titleId} className="create-review-flow-title">
                {current.title}
              </h1>
              {current.hint ? <p className="create-review-flow-hint">{current.hint}</p> : null}
            </div>
            <button
              type="button"
              className="create-review-icon-btn"
              onClick={onClose}
              aria-label="Close"
              disabled={busy}
            >
              <i className="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
          </div>
          <div
            className="create-review-flow-progress"
            role="progressbar"
            aria-valuenow={step + 1}
            aria-valuemin={1}
            aria-valuemax={flowSteps.length}
            aria-label={`Progress, step ${step + 1} of ${flowSteps.length}`}
          >
            {flowSteps.map((s, i) => (
              <div
                key={s.id}
                className={`create-review-flow-progress-seg${i <= step ? " active" : ""}`}
                aria-hidden="true"
              />
            ))}
          </div>
        </div>

        <div className="create-review-flow-body">
          {current.id === "details" ? (
            <div className="create-review-flow-fields">{renderDetails()}</div>
          ) : null}
          {current.id === "review" ? (
            <div className="create-review-review">{renderReview()}</div>
          ) : null}
          {error ? (
            <p className="create-review-flow-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <div className="create-review-flow-footer">
          <div className="create-review-flow-actions">
            {step > 0 ? (
              <button
                type="button"
                className="create-review-flow-back"
                onClick={goBack}
                disabled={busy}
              >
                Back
              </button>
            ) : null}
            {isLastStep ? (
              <BusyButton
                type="button"
                className={`create-review-flow-primary${step > 0 ? " with-back" : ""}`}
                busy={busy}
                busyLabel={busyLabel}
                onClick={handleSubmit}
              >
                {submitLabel}
              </BusyButton>
            ) : (
              <button
                type="button"
                className={`create-review-flow-primary${step > 0 ? " with-back" : ""}`}
                onClick={goNext}
                disabled={busy}
              >
                Continue
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
