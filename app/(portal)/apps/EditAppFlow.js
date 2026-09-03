'use client';

import { useState } from "react";
import BusyButton from "@/components/BusyButton";
import RteEditor from "./RteEditor";
import { getEditorHtml, sanitizeHtml } from "./html";

const STEPS = [
    {
        id: "details",
        title: "App details",
        hint: "Update the name, description, GitHub repo, and live URL.",
    },
    {
        id: "review",
        title: "Review changes",
        hint: "Confirm how this app will appear in the directory.",
    },
];

function Field({ label, children }) {
    return (
        <label className="app-edit-field">
            <span className="app-edit-field-label">{label}</span>
            {children}
        </label>
    );
}

function ReviewRow({ label, value, changed, children }) {
    return (
        <div className={`app-edit-review-row${changed ? " app-edit-review-row--changed" : ""}`}>
            <span className="app-edit-review-label">{label}</span>
            <div className="app-edit-review-value">
                {children ?? value}
                {changed ? <span className="app-edit-review-badge">Updated</span> : null}
            </div>
        </div>
    );
}

export default function EditAppFlow({
    appName,
    setAppName,
    githubRepo,
    setGithubRepo,
    liveUrl,
    setLiveUrl,
    seedKey,
    initialHtml,
    editorRef,
    original,
    busy,
    onClose,
    onSave,
}) {
    const [step, setStep] = useState(0);
    const [error, setError] = useState(null);
    const [reviewDesc, setReviewDesc] = useState("");

    const current = STEPS[step];
    const isLastStep = step === STEPS.length - 1;

    const validateStep = (index) => {
        if (STEPS[index].id !== "details") return null;
        const name = appName.trim();
        const desc = getEditorHtml(editorRef.current);
        if (!name) return "App name is required.";
        if (!desc || !desc.replace(/<[^>]*>/g, "").trim()) return "App description is required.";
        return null;
    };

    const goNext = () => {
        const stepError = validateStep(step);
        if (stepError) {
            setError(stepError);
            return;
        }
        setError(null);
        setReviewDesc(getEditorHtml(editorRef.current));
        setStep((s) => Math.min(s + 1, STEPS.length - 1));
    };

    const goBack = () => {
        setError(null);
        setStep((s) => Math.max(s - 1, 0));
    };

    const handleSave = () => {
        const stepError = validateStep(0);
        if (stepError) {
            setStep(0);
            setError(stepError);
            return;
        }
        setError(null);
        onSave();
    };

    const trimmedName = appName.trim();
    const trimmedRepo = githubRepo.trim();
    const trimmedLiveUrl = (liveUrl || "").trim();
    const safeDesc = sanitizeHtml(reviewDesc || getEditorHtml(editorRef.current));

    const nameChanged = trimmedName !== (original?.name || "").trim();
    const descChanged = safeDesc !== sanitizeHtml(original?.desc || "");
    const repoChanged = trimmedRepo !== (original?.githubRepo || "").trim();
    const liveUrlChanged = trimmedLiveUrl !== (original?.liveUrl || "").trim();

    return (
        <div className="app-edit-flow" role="dialog" aria-modal="true" aria-labelledby="app-edit-flow-title">
            <div className="app-edit-flow-inner">
                <div className="app-edit-flow-header">
                    <button type="button" className="app-edit-flow-close" onClick={onClose} aria-label="Close">
                        <i className="fa-solid fa-xmark" aria-hidden="true"></i>
                    </button>
                    <div
                        className="app-edit-flow-progress"
                        role="progressbar"
                        aria-valuenow={step + 1}
                        aria-valuemin={1}
                        aria-valuemax={STEPS.length}
                        aria-label={`Edit app progress, step ${step + 1} of ${STEPS.length}`}
                    >
                        {STEPS.map((s, i) => (
                            <div
                                key={s.id}
                                className={`app-edit-flow-progress-seg${i <= step ? " active" : ""}`}
                                aria-hidden="true"
                            />
                        ))}
                    </div>
                    <h1 id="app-edit-flow-title" className="app-edit-flow-title">{current.title}</h1>
                    <p className="app-edit-flow-hint">{current.hint}</p>
                </div>

                <div className="app-edit-flow-body">
                    {current.id === "details" ? (
                        <div className="app-edit-flow-fields">
                            <Field label="App Name">
                                <input
                                    type="text"
                                    id="editAppName"
                                    placeholder="e.g. HR Portal Dashboard"
                                    value={appName}
                                    onChange={(e) => setAppName(e.target.value)}
                                    required
                                    autoComplete="off"
                                />
                            </Field>
                            <Field label="App Description">
                                <RteEditor
                                    seedKey={seedKey}
                                    initialHtml={initialHtml}
                                    placeholder="e.g. Backoffice tool managing employee documents and time-off tracking."
                                    editorRef={editorRef}
                                />
                            </Field>
                            <Field label="GitHub Repo (optional)">
                                <input
                                    type="text"
                                    id="editAppGithubRepo"
                                    placeholder="e.g. octocat/hello-world"
                                    value={githubRepo}
                                    onChange={(e) => setGithubRepo(e.target.value)}
                                    autoComplete="off"
                                />
                            </Field>
                            <Field label="Live URL (optional)">
                                <input
                                    type="url"
                                    id="editAppLiveUrl"
                                    placeholder="e.g. https://app.example.com"
                                    value={liveUrl}
                                    onChange={(e) => setLiveUrl(e.target.value)}
                                    autoComplete="off"
                                />
                            </Field>
                        </div>
                    ) : null}

                    {current.id === "review" ? (
                        <div className="app-edit-review">
                            <div className="app-edit-preview-card card">
                                <div className="app-card-top">
                                    <h4>
                                        <span className="app-card-title">{trimmedName || "Untitled app"}</span>
                                    </h4>
                                </div>
                                <div
                                    className="app-desc-html app-card-desc"
                                    dangerouslySetInnerHTML={{ __html: safeDesc || "<p>No description</p>" }}
                                />
                                {trimmedRepo ? (
                                    <p className="app-edit-preview-repo">
                                        <i className="fa-brands fa-github" aria-hidden="true"></i>
                                        {trimmedRepo}
                                    </p>
                                ) : null}
                                {trimmedLiveUrl ? (
                                    <p className="app-edit-preview-repo">
                                        <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>
                                        {trimmedLiveUrl}
                                    </p>
                                ) : null}
                            </div>

                            <div className="app-edit-review-details">
                                <ReviewRow label="App name" value={trimmedName} changed={nameChanged} />
                                <ReviewRow label="Description" changed={descChanged}>
                                    <div
                                        className="app-desc-html"
                                        dangerouslySetInnerHTML={{ __html: safeDesc || "<p>—</p>" }}
                                    />
                                </ReviewRow>
                                <ReviewRow
                                    label="GitHub repo"
                                    value={trimmedRepo || "—"}
                                    changed={repoChanged}
                                />
                                <ReviewRow
                                    label="Live URL"
                                    value={trimmedLiveUrl || "—"}
                                    changed={liveUrlChanged}
                                />
                            </div>
                        </div>
                    ) : null}

                    {error ? (
                        <p className="app-edit-flow-error" role="alert">{error}</p>
                    ) : null}
                </div>

                <div className="app-edit-flow-footer">
                    <div className="app-edit-flow-actions">
                        {step > 0 ? (
                            <button type="button" className="app-edit-flow-back" onClick={goBack} disabled={busy}>
                                Back
                            </button>
                        ) : null}
                        {isLastStep ? (
                            <BusyButton
                                type="button"
                                className="app-edit-flow-primary"
                                busy={busy}
                                busyLabel="Saving…"
                                onClick={handleSave}
                            >
                                Approve changes
                            </BusyButton>
                        ) : (
                            <button
                                type="button"
                                className={`app-edit-flow-primary${step > 0 ? " with-back" : ""}`}
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
