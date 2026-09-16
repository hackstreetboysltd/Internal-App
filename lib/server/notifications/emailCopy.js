/**
 * Complete EmailJS copy. The dashboard template must use these fields as-is —
 * never stitch "just {{action}} an entry in the {{module}} module" around them.
 */

import {
  isSecureNoticeAction,
  SECURE_CHANNEL_ADDED,
  SECURE_MESSAGE_RECEIVED,
} from "../../secureNoticeCopy.js";
import { displayGoalText } from "../../goalAppMentions.js";

export {
  isSecureNoticeAction,
  SECURE_CHANNEL_ADDED,
  SECURE_MESSAGE_RECEIVED,
};

export const EMAIL_CTA_LABEL = "Open Portal";

export const EMAIL_FOOTER = {
  assigned: "You're receiving this because a goal was assigned to you in the HackstreetBoys Internal Portal.",
  reminder: "You're receiving this because an admin sent you a goal reminder.",
  direct: "You're receiving this because this update is about your work in the HackstreetBoys Internal Portal.",
  admin: "You're receiving this because you're an admin on the HackstreetBoys Internal Portal.",
  access: "You're receiving this because of a portal access request.",
  team: "You're receiving this because you're a member of the HackstreetBoys Internal Portal.",
};

/**
 * @param {string} text
 * @returns {string}
 */
export function plainNotificationText(text) {
  return String(text || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param {string} text
 * @returns {string}
 */
export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {{ text?: string }[] | unknown} goalItems
 * @param {{ id?: unknown, name?: string }[] | null | undefined} [apps]
 * @returns {string[]}
 */
export function extractGoalTexts(goalItems, apps) {
  if (!Array.isArray(goalItems)) return [];
  return goalItems
    .map((goal) => {
      const raw = goal && typeof goal === "object" ? goal.text : goal;
      return displayGoalText(plainNotificationText(raw), apps);
    })
    .filter(Boolean);
}

/**
 * @param {string} text
 * @param {number} [max]
 * @returns {string}
 */
export function clipWithEllipsis(text, max = 200) {
  const value = String(text || "");
  if (value.length <= max) return value;
  const budget = Math.max(1, max - 3);
  return `${value.slice(0, budget).trimEnd()}...`;
}

/**
 * Plain-text goal body for EmailJS. Always a single string — EmailJS list/boolean
 * sections are unreliable across dashboard saves, so we never depend on them.
 * @param {string[]} texts
 * @returns {string}
 */
export function formatGoalsDetailText(texts) {
  const clipped = texts.map((text) => clipWithEllipsis(text, 200)).filter(Boolean);
  if (!clipped.length) return "";
  if (clipped.length === 1) return clipped[0];
  return clipped.map((text) => `• ${text}`).join("\n");
}

/**
 * @param {string[]} texts
 * @returns {string}
 * @deprecated Use formatGoalsDetailText — kept for any leftover callers.
 */
export function formatGoalsDetailHtml(texts) {
  return escapeHtml(formatGoalsDetailText(texts)).replace(/\n/g, "<br>");
}

export function firstNamePossessive(fullName) {
  const first = String(fullName || "").trim().split(/\s+/).filter(Boolean)[0] || "";
  if (!first) return "";
  const letters = first.replace(/[^A-Za-z]/g, "");
  const token = letters && letters === letters.toUpperCase()
    ? first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()
    : first.charAt(0).toUpperCase() + first.slice(1);
  return `${token}'s`;
}

/**
 * @param {string} previousOwnerName
 * @param {boolean} many
 * @returns {string}
 */
export function reassignedGoalSubject(previousOwnerName, many) {
  const whose = firstNamePossessive(previousOwnerName);
  const noun = many ? "goals" : "goal";
  if (!whose) {
    return many ? "You have been re-assigned some goals" : "You have been re-assigned a goal";
  }
  return `You have been re-assigned ${whose} ${noun}`;
}

/**
 * In-app / stored label — never wrap extra quotation marks around the text.
 * @param {string[]} texts
 * @param {string} fallback
 * @returns {string}
 */
export function formatGoalsItemName(texts, fallback) {
  if (texts.length === 1) return clipWithEllipsis(texts[0], 140);
  if (texts.length > 1) {
    return clipWithEllipsis(
      `${texts.length} goals: ${texts.map((text) => clipWithEllipsis(text, 80)).join("; ")}`,
      200,
    );
  }
  return fallback;
}

/**
 * @param {{
 *   actorName?: string,
 *   eyebrow: string,
 *   headline: string,
 *   detailText?: string,
 *   goalTexts?: string[],
 *   note?: string,
 *   timestamp: string,
 *   portalUrl: string,
 *   footer: string,
 *   subject: string,
 *   module?: string,
 * }} fields
 */
export function buildEmailTemplateParams(fields) {
  const actorName = String(fields.actorName || "").trim();
  const headline = String(fields.headline || "").trim();
  const note = String(fields.note || "").trim();
  const moduleName = String(fields.module || "").trim();
  const goalTexts = Array.isArray(fields.goalTexts)
    ? fields.goalTexts.map((text) => clipWithEllipsis(String(text), 200)).filter(Boolean)
    : [];
  const detailText = clipWithEllipsis(
    String(fields.detailText || formatGoalsDetailText(goalTexts) || "").trim(),
    200,
  );

  return {
    actor_name: actorName,
    eyebrow: String(fields.eyebrow || "").trim().toUpperCase(),
    headline,
    // Single preformatted string. Template must use {{.}} inside {{#detail_text}}.
    detail_text: detailText,
    note,
    timestamp: String(fields.timestamp || ""),
    portal_url: String(fields.portalUrl || ""),
    cta_label: EMAIL_CTA_LABEL,
    footer: fields.footer,
    subject: fields.subject,
    module: moduleName,
  };
}

/**
 * @param {{
 *   actorName: string,
 *   previousOwnerName?: string,
 *   action?: "assigned" | "updated" | "reassigned",
 *   goalItems?: { text?: string }[],
 *   apps?: { id?: unknown, name?: string }[],
 *   timestamp: string,
 *   portalUrl: string,
 * }} payload
 */
export function assigneeGoalEmailCopy(payload) {
  const texts = extractGoalTexts(payload.goalItems, payload.apps);
  const many = texts.length > 1;
  const reassigned = payload.action === "reassigned";
  const updated = payload.action === "updated";
  // Subject only — leave headline empty so Gmail/push previews don't repeat it.
  let subject;
  if (reassigned) {
    subject = reassignedGoalSubject(payload.previousOwnerName, many);
  } else if (updated) {
    subject = many ? "Goals assigned to you were updated" : "A goal assigned to you was updated";
  } else {
    subject = many ? "You have been assigned some goals" : "You have been assigned a goal";
  }

  return buildEmailTemplateParams({
    actorName: "",
    eyebrow: "",
    headline: "",
    goalTexts: texts,
    timestamp: payload.timestamp,
    portalUrl: payload.portalUrl,
    footer: "",
    subject,
    module: "Goals",
  });
}

/**
 * @param {{
 *   actorName: string,
 *   goalText: string,
 *   apps?: { id?: unknown, name?: string }[],
 *   timestamp: string,
 *   portalUrl: string,
 * }} payload
 */
export function goalReminderEmailCopy(payload) {
  const actorName = String(payload.actorName || "Someone").trim() || "Someone";
  const snippet = displayGoalText(plainNotificationText(payload.goalText), payload.apps) || "your goal";
  const note = plainNotificationText(payload.customMessage);

  return buildEmailTemplateParams({
    actorName,
    eyebrow: "Goal reminder",
    headline: `${actorName} sent you a reminder about this goal.`,
    detailText: clipWithEllipsis(snippet, 200),
    note,
    timestamp: payload.timestamp,
    portalUrl: payload.portalUrl,
    footer: EMAIL_FOOTER.reminder,
    subject: `Reminder: complete your goal`,
    module: "Goals",
  });
}

/**
 * @param {{
 *   actorName: string,
 *   action: string,
 *   itemName: string,
 *   module: string,
 *   timestamp: string,
 *   portalUrl: string,
 * }} payload
 */
export function teamEmailCopy(payload) {
  const actorName = String(payload.actorName || "Someone").trim() || "Someone";
  const verb = {
    added: "added",
    edited: "edited",
    deleted: "deleted",
    updated: "updated",
  }[payload.action] || String(payload.action || "updated");
  const moduleName = String(payload.module || "portal");
  const item = plainNotificationText(payload.itemName);

  return buildEmailTemplateParams({
    actorName,
    eyebrow: `${moduleName} activity`,
    headline: `${actorName} ${verb} a ${moduleName} item.`,
    detailText: item,
    timestamp: payload.timestamp,
    portalUrl: payload.portalUrl,
    footer: EMAIL_FOOTER.team,
    subject: `${actorName} ${verb} a ${moduleName} item`,
    module: moduleName,
  });
}

/**
 * @param {{
 *   actorName: string,
 *   action: string,
 *   itemName: string,
 *   module: string,
 *   timestamp: string,
 *   portalUrl: string,
 * }} payload
 */
export function adminEmailCopy(payload) {
  const actorName = String(payload.actorName || "Someone").trim() || "Someone";
  const action = plainNotificationText(payload.action);
  const moduleName = String(payload.module || "portal");
  const item = plainNotificationText(payload.itemName);

  return buildEmailTemplateParams({
    actorName,
    eyebrow: `${moduleName} review`,
    headline: `${actorName} ${action}.`,
    detailText: item,
    timestamp: payload.timestamp,
    portalUrl: payload.portalUrl,
    footer: EMAIL_FOOTER.admin,
    subject: `${actorName} ${action}`,
    module: moduleName,
  });
}

/**
 * @param {{
 *   name?: string,
 *   email: string,
 *   timestamp: string,
 *   portalUrl: string,
 * }} payload
 */
export function pendingUserEmailCopy(payload) {
  const actorName = String(payload.name || payload.email || "Someone").trim() || "Someone";
  return buildEmailTemplateParams({
    actorName,
    eyebrow: "Access request",
    headline: `${actorName} requested access to the portal.`,
    detailText: String(payload.email || ""),
    timestamp: payload.timestamp,
    portalUrl: payload.portalUrl,
    footer: EMAIL_FOOTER.access,
    subject: `Access request: ${payload.email}`,
    module: "User Access Control",
  });
}

/**
 * @param {{
 *   userEmail: string,
 *   timestamp: string,
 *   portalUrl: string,
 * }} payload
 */
export function approvalEmailCopy(payload) {
  return buildEmailTemplateParams({
    actorName: "Administrator",
    eyebrow: "Access approved",
    headline: "Your portal access has been approved.",
    detailText: `You can now sign in with ${payload.userEmail}.`,
    timestamp: payload.timestamp,
    portalUrl: payload.portalUrl,
    footer: EMAIL_FOOTER.access,
    subject: "Your access was approved",
    module: "User Access Control",
  });
}

/**
 * Generic “check it out” notice — subject only, no actor/item leak.
 * @param {{
 *   subject: string,
 *   timestamp: string,
 *   portalUrl: string,
 * }} payload
 */
export function secureNoticeEmailCopy(payload) {
  return buildEmailTemplateParams({
    actorName: "",
    eyebrow: "",
    headline: "",
    detailText: "",
    timestamp: payload.timestamp,
    portalUrl: payload.portalUrl,
    footer: "",
    subject: String(payload.subject || "").trim(),
    module: "Messages",
  });
}

/**
 * @param {{
 *   actorName: string,
 *   action: string,
 *   itemName: string,
 *   module: string,
 *   timestamp: string,
 *   portalUrl: string,
 * }} payload
 */
export function directEmailCopy(payload) {
  const actorName = String(payload.actorName || "Someone").trim() || "Someone";
  const action = plainNotificationText(payload.action);
  const moduleName = String(payload.module || "portal");
  const item = plainNotificationText(payload.itemName);

  return buildEmailTemplateParams({
    actorName,
    eyebrow: moduleName,
    headline: `${actorName} ${action}.`,
    detailText: item,
    timestamp: payload.timestamp,
    portalUrl: payload.portalUrl,
    footer: EMAIL_FOOTER.direct,
    subject: `${actorName} ${action}`,
    module: moduleName,
  });
}
