"use client";

import {
  DEFAULT_SECURITY_LEVEL,
  normalizeSecurityLevel,
  SECURITY_LEVEL_OPTIONS,
} from "@/lib/securityLevel";
import "./SecurityLevelField.css";

/**
 * Shared A/B security level control for create/edit forms.
 * Default is B (general view).
 */
export default function SecurityLevelField({
  value = DEFAULT_SECURITY_LEVEL,
  onChange,
  disabled = false,
  id = "security-level",
}) {
  const current = normalizeSecurityLevel(value);
  const legendId = `${id}-legend`;

  return (
    <fieldset className="security-level-field" disabled={disabled}>
      <legend id={legendId} className="security-level-field__legend">
        Who can see this
      </legend>
      <div className="security-level-field__options" role="radiogroup" aria-labelledby={legendId}>
        {SECURITY_LEVEL_OPTIONS.map((opt) => {
          const inputId = `${id}-${opt.value}`;
          const selected = current === opt.value;
          return (
            <label
              key={opt.value}
              htmlFor={inputId}
              className={`security-level-field__option${selected ? " is-selected" : ""}`}
            >
              <input
                id={inputId}
                type="radio"
                name={id}
                value={opt.value}
                checked={selected}
                onChange={() => onChange?.(opt.value)}
              />
              <span className="security-level-field__mark" aria-hidden="true">
                {opt.value}
              </span>
              <span className="security-level-field__option-text">
                <span className="security-level-field__option-label">{opt.cardLabel || opt.label}</span>
                <span className="security-level-field__option-hint">{opt.hint}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
