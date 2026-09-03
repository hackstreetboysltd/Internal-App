/**
 * Complete EmailJS copy. The dashboard template must use these fields as-is —
 * never stitch "just {{action}} an entry in the {{module}} module" around them.
 */

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
 * @returns {string[]}
 */
export function extractGoalTexts(goalItems) {
  if (!Array.isArray(goalItems)) return [];
  return goalItems
    .map((goal) => {
      const raw = goal && typeof goal === "object" ? goal.text : goal;
      return plainNotificationText(raw);
    })
    .filter(Boolean);
}

/**
 * @param {string[]} texts
 * @returns {string}
 */
export function formatGoalsDetailHtml(texts) {
  const clipped = texts.map((text) => text.slice(0, 200));
  if (!clipped.length) return "";
  if (clipped.length === 1) return escapeHtml(clipped[0]);
  const items = clipped
    .map((text) => `<li>${escapeHtml(text)}</li>`)
    .join("");
  return `<ul style="margin:8px 0 0;padding-left:1.2em;text-align:left;">${items}</ul>`;
}

/**
 * In-app / stored label — never wrap extra quotation marks around the text.
 * @param {string[]} texts
 * @param {string} fallback
 * @returns {string}
 */
export function formatGoalsItemName(texts, fallback) {
  if (texts.length === 1) return texts[0].slice(0, 140);
  if (texts.length > 1) {
    return `${texts.length} goals: ${texts.map((text) => text.slice(0, 80)).join("; ")}`.slice(0, 200);
  }
  return fallback;
}

/**
 * @param {{
 *   actorName?: string,
 *   eyebrow: string,
 *   headline: string,
 *   detailHtml?: string,
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
  const detailHtml = String(fields.detailHtml || "");
  const note = String(fields.note || "").trim();
  const moduleName = String(fields.module || "").trim();

  return {
    actor_name: actorName,
    eyebrow: String(fields.eyebrow || "").trim().toUpperCase(),
    headline,
    detail_html: detailHtml,
    note,
    timestamp: fields.timestamp,
    portal_url: fields.portalUrl,
    cta_label: EMAIL_CTA_LABEL,
    footer: fields.footer,
    subject: fields.subject,
    module: moduleName,
    // Intentionally unused by the new template. Left empty so a stale
    // "just {{action}} an entry…" template cannot splice in a second sentence.
    action: "",
    item_name: "",
  };
}

/**
 * @param {{
 *   actorName: string,
 *   action?: "assigned" | "updated",
 *   goalItems?: { text?: string }[],
 *   timestamp: string,
 *   portalUrl: string,
 * }} payload
 */
export function assigneeGoalEmailCopy(payload) {
  const actorName = String(payload.actorName || "Someone").trim() || "Someone";
  const texts = extractGoalTexts(payload.goalItems);
  const many = texts.length > 1;
  const updated = payload.action === "updated";
  const headline = updated
    ? (many ? `${actorName} updated goals assigned to you.` : `${actorName} updated a goal assigned to you.`)
    : (many ? `${actorName} assigned you these goals.` : `${actorName} assigned you a goal.`);
  const subject = updated
    ? `[Portal] ${actorName} updated a goal assigned to you`
    : `[Portal] ${actorName} assigned you a goal`;

  return buildEmailTemplateParams({
    actorName,
    eyebrow: "Assigned goal",
    headline,
    detailHtml: formatGoalsDetailHtml(texts),
    timestamp: payload.timestamp,
    portalUrl: payload.portalUrl,
    footer: EMAIL_FOOTER.assigned,
    subject,
    module: "Goals",
  });
}

/**
 * @param {{
 *   actorName: string,
 *   goalText: string,
 *   customMessage?: string,
 *   timestamp: string,
 *   portalUrl: string,
 * }} payload
 */
export function goalReminderEmailCopy(payload) {
  const actorName = String(payload.actorName || "Someone").trim() || "Someone";
  const snippet = plainNotificationText(payload.goalText) || "your goal";
  const note = plainNotificationText(payload.customMessage);

  return buildEmailTemplateParams({
    actorName,
    eyebrow: "Goal reminder",
    headline: `${actorName} sent you a reminder about this goal.`,
    detailHtml: escapeHtml(snippet.slice(0, 200)),
    note,
    timestamp: payload.timestamp,
    portalUrl: payload.portalUrl,
    footer: EMAIL_FOOTER.reminder,
    subject: `[Portal] Reminder: complete your goal`,
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
    detailHtml: item ? escapeHtml(item) : "",
    timestamp: payload.timestamp,
    portalUrl: payload.portalUrl,
    footer: EMAIL_FOOTER.team,
    subject: `[Portal] ${actorName} ${verb} a ${moduleName} item`,
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
    detailHtml: item ? escapeHtml(item) : "",
    timestamp: payload.timestamp,
    portalUrl: payload.portalUrl,
    footer: EMAIL_FOOTER.admin,
    subject: `[Portal] ${actorName} ${action}`,
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
    detailHtml: escapeHtml(String(payload.email || "")),
    timestamp: payload.timestamp,
    portalUrl: payload.portalUrl,
    footer: EMAIL_FOOTER.access,
    subject: `[Portal] Access request: ${payload.email}`,
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
    detailHtml: escapeHtml(`You can now sign in with ${payload.userEmail}.`),
    timestamp: payload.timestamp,
    portalUrl: payload.portalUrl,
    footer: EMAIL_FOOTER.access,
    subject: "[Portal] Your access was approved",
    module: "User Access Control",
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
    detailHtml: item ? escapeHtml(item) : "",
    timestamp: payload.timestamp,
    portalUrl: payload.portalUrl,
    footer: EMAIL_FOOTER.direct,
    subject: `[Portal] ${actorName} ${action}`,
    module: moduleName,
  });
}
