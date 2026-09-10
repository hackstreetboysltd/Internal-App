"use client";

import CreateReviewFlow, {
  CreateReviewField,
  CreateReviewRow,
} from "@/components/CreateReviewFlow";
import {
  docIconForName,
  fileExtension,
  formatFileBytes,
  sanitizeDocumentName,
} from "./documentsHelpers";

const STEPS = [
  {
    id: "details",
    title: "Upload document",
    hint: "Choose a file and name it.",
  },
  {
    id: "review",
    title: "Review upload",
    hint: "Confirm the file before uploading.",
  },
];

function FileDrop({ inputRef, file, dragOver, setDragOver, onFile, stageState, stageProgress }) {
  const ext = file ? (fileExtension(file.name).toUpperCase() || "FILE") : "";
  const staging = stageState === "uploading";
  const stageReady = stageState === "ready";
  const stageFailed = stageState === "error";
  const pct = Number.isFinite(stageProgress) ? Math.max(0, Math.min(100, stageProgress)) : 0;
  const hint = staging
    ? (pct > 0 ? `Uploading… ${pct}%` : "Uploading to library…")
    : stageFailed
      ? "Upload failed — click to retry"
      : stageReady
        ? "Ready · click to replace"
        : "Click to replace";
  return (
    <label
      className={`docs-drop${dragOver ? " dragover" : ""}${file ? " has-file" : ""}${staging ? " is-staging" : ""}${stageReady ? " is-staged" : ""}${stageFailed ? " is-stage-error" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        onFile(e.dataTransfer.files);
      }}
    >
      {file ? (
        <>
          <i className={docIconForName(file.name)} aria-hidden="true"></i>
          <span className="docs-drop-name">{file.name}</span>
          <span className="docs-drop-meta">{formatFileBytes(file.size)} · {ext}</span>
          <span className={`docs-drop-hint${staging ? " is-busy" : ""}`}>
            {staging ? <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" /> : null}
            {staging ? " " : null}
            {hint}
          </span>
          {staging ? (
            <span className="docs-drop-progress" aria-hidden="true">
              <span style={{ width: `${pct}%` }} />
            </span>
          ) : null}
        </>
      ) : (
        <>
          <i className="fa-solid fa-cloud-arrow-up" aria-hidden="true"></i>
          <span>Drop a file here or click to choose</span>
        </>
      )}
      <input
        ref={inputRef}
        type="file"
        onChange={(e) => onFile(e.target.files)}
      />
    </label>
  );
}

export default function CreateDocumentFlow({
  pickedFile,
  saveAsName,
  setSaveAsName,
  dropOver,
  setDropOver,
  onFile,
  inputRef,
  stageState,
  stageProgress,
  busy,
  onClose,
  onSubmit,
}) {
  const displayName = sanitizeDocumentName(saveAsName) || pickedFile?.name || "";
  const effectiveStage = pickedFile ? stageState : "idle";

  const validateDetails = () => {
    if (!pickedFile) return "Choose a file to upload.";
    if (effectiveStage === "error") return "File upload failed. Choose the file again.";
    if (effectiveStage === "uploading") return "File is still uploading. Wait until it shows Ready.";
    if (effectiveStage !== "ready") return "File is still uploading. Wait until it shows Ready.";
    if (!displayName.trim()) return "Enter a name to save as.";
    return null;
  };

  return (
    <CreateReviewFlow
      className="documents-create-flow"
      steps={STEPS}
      busy={busy}
      submitLabel="Upload"
      busyLabel="Saving…"
      titleId="create-document-flow-title"
      validateDetails={validateDetails}
      onClose={onClose}
      onSubmit={onSubmit}
      renderDetails={() => (
        <>
          <FileDrop
            inputRef={inputRef}
            file={pickedFile}
            dragOver={dropOver}
            setDropOver={setDropOver}
            onFile={onFile}
            stageState={effectiveStage}
            stageProgress={stageProgress}
          />
          {pickedFile ? (
            <CreateReviewField label="Save as" htmlFor="createDocSaveAs">
              <input
                id="createDocSaveAs"
                type="text"
                inputMode="text"
                enterKeyHint="done"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                value={saveAsName}
                onChange={(e) => setSaveAsName(e.target.value)}
              />
            </CreateReviewField>
          ) : null}
        </>
      )}
      renderReview={() => (
        <div className="create-review-details">
          <CreateReviewRow label="File name" value={displayName || "—"} />
          <CreateReviewRow
            label="Size"
            value={pickedFile ? formatFileBytes(pickedFile.size) : "—"}
          />
        </div>
      )}
    />
  );
}
