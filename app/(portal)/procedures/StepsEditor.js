"use client";

import { useRef, useState } from "react";

const ACCENT = "#a78bfa";

export default function StepsEditor({ steps, setSteps, inputId }) {
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(null);
  const [editText, setEditText] = useState("");
  const dragFrom = useRef(null);

  const addStep = () => {
    const text = draft.trim();
    if (!text) return;
    setSteps([...steps, text]);
    setDraft("");
  };

  const saveEdit = (idx) => {
    const next = steps.slice();
    next[idx] = editText.trim() || steps[idx];
    setSteps(next);
    setEditing(null);
    setEditText("");
  };

  return (
    <>
      <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
        <input
          type="text"
          id={inputId}
          placeholder="Add a new step..."
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addStep();
            }
          }}
          style={{ flex: 1, padding: "8px 12px", fontSize: "0.85rem", marginBottom: 0 }}
        />
        <button
          type="button"
          onClick={addStep}
          style={{
            width: "auto",
            background: "rgba(167, 139, 250, 0.1)",
            border: "1px solid rgba(167, 139, 250, 0.3)",
            color: ACCENT,
            padding: "8px 12px",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: "0.85rem",
            marginBottom: 0,
            boxShadow: "none",
          }}
        >
          <i className="fa-solid fa-plus"></i>
        </button>
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, minHeight: 50, maxHeight: 200, overflowY: "auto" }}>
        {steps.map((text, idx) => (
          <li
            key={`${idx}-${text.slice(0, 12)}`}
            className="step-item"
            draggable
            onDragStart={() => {
              dragFrom.current = idx;
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              const from = dragFrom.current;
              if (from == null || from === idx) return;
              const next = steps.slice();
              const [moved] = next.splice(from, 1);
              next.splice(idx, 0, moved);
              setSteps(next);
              dragFrom.current = null;
            }}
          >
            <i className="fa-solid fa-grip-vertical drag-handle"></i>
            {editing === idx ? (
              <input
                type="text"
                className="step-input"
                value={editText}
                autoFocus
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    saveEdit(idx);
                  }
                }}
              />
            ) : (
              <span className="step-content">{text}</span>
            )}
            <div className="step-actions">
              {editing === idx ? (
                <button type="button" className="step-btn" onClick={() => saveEdit(idx)}>
                  <i className="fa-solid fa-check"></i>
                </button>
              ) : (
                <button
                  type="button"
                  className="step-btn"
                  onClick={() => {
                    setEditing(idx);
                    setEditText(text);
                  }}
                >
                  <i className="fa-solid fa-pen"></i>
                </button>
              )}
              <button
                type="button"
                className="step-btn"
                onClick={() => setSteps(steps.filter((_, i) => i !== idx))}
              >
                <i className="fa-solid fa-trash"></i>
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
