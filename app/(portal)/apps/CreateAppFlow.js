"use client";

import { useState } from "react";
import CreateReviewFlow, {
  CreateReviewField,
  CreateReviewRow,
} from "@/components/CreateReviewFlow";
import RteEditor from "./RteEditor";
import { getEditorHtml, sanitizeHtml } from "./html";

const STEPS = [
  {
    id: "details",
    title: "App details",
    hint: "Name, description, and optional links.",
  },
  {
    id: "review",
    title: "Review registration",
    hint: "Confirm how this app will appear in the directory.",
  },
];

export default function CreateAppFlow({
  appName,
  setAppName,
  githubRepo,
  setGithubRepo,
  liveUrl,
  setLiveUrl,
  seedKey,
  editorRef,
  busy,
  onClose,
  onSubmit,
}) {
  const [reviewDesc, setReviewDesc] = useState("");

  const validateDetails = () => {
    const name = appName.trim();
    const desc = getEditorHtml(editorRef.current);
    if (!name) return "App name is required.";
    if (!desc || !desc.replace(/<[^>]*>/g, "").trim()) {
      return "App description is required.";
    }
    return null;
  };

  const trimmedName = appName.trim();
  const trimmedRepo = githubRepo.trim();
  const trimmedLiveUrl = (liveUrl || "").trim();
  const safeDesc = sanitizeHtml(reviewDesc || getEditorHtml(editorRef.current));

  return (
    <CreateReviewFlow
      className="apps-create-flow"
      steps={STEPS}
      busy={busy}
      submitLabel="Register App"
      busyLabel="Registering…"
      titleId="create-app-flow-title"
      validateDetails={validateDetails}
      onBeforeReview={() => setReviewDesc(getEditorHtml(editorRef.current))}
      onClose={onClose}
      onSubmit={onSubmit}
      renderDetails={() => (
        <>
          <CreateReviewField label="App Name" htmlFor="createAppName">
            <input
              type="text"
              id="createAppName"
              placeholder="e.g. HR Portal Dashboard"
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              required
              autoComplete="off"
            />
          </CreateReviewField>
          <CreateReviewField label="App Description">
            <RteEditor
              seedKey={seedKey}
              initialHtml=""
              placeholder="e.g. Backoffice tool managing employee documents and time-off tracking."
              editorRef={editorRef}
            />
          </CreateReviewField>
          <CreateReviewField label="GitHub Repo (optional)" htmlFor="createAppGithubRepo">
            <input
              type="text"
              id="createAppGithubRepo"
              placeholder="e.g. octocat/hello-world"
              value={githubRepo}
              onChange={(e) => setGithubRepo(e.target.value)}
              autoComplete="off"
            />
          </CreateReviewField>
          <CreateReviewField label="Live URL (optional)" htmlFor="createAppLiveUrl">
            <input
              type="url"
              id="createAppLiveUrl"
              placeholder="e.g. https://app.example.com"
              value={liveUrl}
              onChange={(e) => setLiveUrl(e.target.value)}
              autoComplete="off"
            />
          </CreateReviewField>
        </>
      )}
      renderReview={() => (
        <>
          <div className="create-review-preview card">
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
              <p className="create-review-preview-meta">
                <i className="fa-brands fa-github" aria-hidden="true"></i>
                {trimmedRepo}
              </p>
            ) : null}
            {trimmedLiveUrl ? (
              <p className="create-review-preview-meta">
                <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>
                {trimmedLiveUrl}
              </p>
            ) : null}
          </div>
          <div className="create-review-details">
            <CreateReviewRow label="App name" value={trimmedName} />
            <CreateReviewRow label="Description">
              <div
                className="app-desc-html"
                dangerouslySetInnerHTML={{ __html: safeDesc || "<p>—</p>" }}
              />
            </CreateReviewRow>
            <CreateReviewRow label="GitHub repo" value={trimmedRepo || "—"} />
            <CreateReviewRow label="Live URL" value={trimmedLiveUrl || "—"} />
          </div>
        </>
      )}
    />
  );
}
