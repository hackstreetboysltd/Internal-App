import { query } from "@/lib/server/db";
import { formatPortalDateTime } from "@/lib/server/realTime";
import { listCollectionItems } from "@/lib/server/collectionsDb";
function credentials() {
  const serviceId = process.env.EMAILJS_SERVICE_ID || "";
  const templateId = process.env.EMAILJS_TEMPLATE_ID || "";
  const publicKey = process.env.EMAILJS_PUBLIC_KEY || "";
  const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL || process.env.APP_URL || "";
  const ready = !!(
    serviceId &&
    templateId &&
    publicKey &&
    serviceId !== "YOUR_SERVICE_ID" &&
    templateId !== "YOUR_TEMPLATE_ID" &&
    publicKey !== "YOUR_PUBLIC_KEY"
  );
  return { serviceId, templateId, publicKey, portalUrl, ready };
}

/**
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {{ text?: string }[]} goalItems
 * @param {string} fallback
 * @returns {string}
 */
function formatAssignedGoalsForEmail(goalItems, fallback) {
  const validGoals = goalItems.filter((goal) => goal && String(goal.text || "").trim());
  if (!validGoals.length) return fallback;
  if (validGoals.length === 1) {
    return `"${String(validGoals[0].text).trim().slice(0, 200)}"`;
  }

  const items = validGoals
    .map((goal) => `<li>${escapeHtml(String(goal.text).trim().slice(0, 200))}</li>`)
    .join("");
  return `<ul style="margin:0;padding-left:1.25em;text-align:left;">${items}</ul>`;
}

/**
 * @param {string} toEmail
 * @param {Record<string, unknown>} templateParams
 */
async function sendOneEmail(toEmail, templateParams) {
  const creds = credentials();
  const origin = (creds.portalUrl || "http://localhost:3000").replace(/\/+$/, "");
  const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
    },
    body: JSON.stringify({
      service_id: creds.serviceId,
      template_id: creds.templateId,
      user_id: creds.publicKey,
      template_params: {
        ...templateParams,
        to_email: toEmail,
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`EmailJS ${res.status}: ${body}`);
  }
}

/**
 * @returns {Promise<string[]>}
 */
async function getAllTeamEmails() {
  const profiles = await listCollectionItems("profile");
  return profiles
    .map((profile) => String(profile.email || "").trim().toLowerCase())
    .filter((email) => email.includes("@"));
}

/**
 * @returns {Promise<string[]>}
 */
async function getAdminEmails() {
  const rows = await query(`SELECT emails FROM role_access WHERE id = 'admins'`);
  const emails = Array.isArray(rows.rows[0]?.emails) ? rows.rows[0].emails : [];
  return emails.map((email) => String(email || "").trim().toLowerCase()).filter(Boolean);
}

/**
 * @param {string} name
 * @returns {Promise<string>}
 */
async function getEmailForProfileName(name) {
  if (!name) return "";
  const profiles = await listCollectionItems("profile");
  const normalized = name.trim().toLowerCase();
  const match = profiles.find((profile) => String(profile.name || "").trim().toLowerCase() === normalized);
  return match ? String(match.email || "").trim() : "";
}

/**
 * @param {{
 *   action: string,
 *   actorName: string,
 *   itemName: string,
 *   module: string,
 *   excludeEmail?: string,
 * }} payload
 */
export async function sendTeamEmail(payload) {
  const {
    action,
    actorName,
    itemName,
    module,
    excludeEmail = "",
  } = payload;

  const creds = credentials();
  if (!creds.ready) {
    console.warn("[Notifications] EmailJS not configured — skipping team broadcast.");
    return;
  }

  const emails = await getAllTeamEmails();
  if (!emails.length) {
    console.warn("[Notifications] No team emails found.");
    return;
  }

  const actionVerb = {
    added: "added",
    edited: "edited",
    deleted: "deleted",
    updated: "updated",
  }[action] || action;

  const timestamp = formatPortalDateTime();
  const templateParams = {
    actor_name: actorName,
    action: actionVerb,
    item_name: itemName,
    module,
    timestamp,
    portal_url: creds.portalUrl,
    subject: `[Portal] ${actorName} ${actionVerb} ${module} entry`,
  };

  await Promise.allSettled(
    emails
      .filter((email) => email.toLowerCase() !== String(excludeEmail || "").trim().toLowerCase())
      .map((email) =>
        sendOneEmail(email, templateParams).catch((err) => {
          console.warn(`[Notifications] Failed to send to ${email}:`, err.message);
        }),
      ),
  );
}

/**
 * @param {{
 *   action: string,
 *   actorName: string,
 *   itemName: string,
 *   module: string,
 *   excludeEmail?: string,
 * }} payload
 */
export async function sendAdminEmail(payload) {
  const creds = credentials();
  if (!creds.ready) {
    console.warn("[Notifications] EmailJS not configured — skipping admin email.");
    return;
  }

  const {
    action,
    actorName,
    itemName,
    module,
    excludeEmail = "",
  } = payload;

  const adminEmails = await getAdminEmails();
  if (!adminEmails.length) {
    console.warn("[Notifications] No admin emails found.");
    return;
  }

  const timestamp = formatPortalDateTime();
  const templateParams = {
    actor_name: actorName,
    action,
    item_name: itemName,
    module,
    timestamp,
    portal_url: creds.portalUrl,
    subject: `[Portal Review] ${actorName} ${action} in ${module}`,
  };

  await Promise.allSettled(
    adminEmails
      .filter((email) => email.toLowerCase() !== String(excludeEmail || "").trim().toLowerCase())
      .map((email) =>
        sendOneEmail(email, templateParams).catch((err) => {
          console.warn(`[Notifications] Failed to send to admin ${email}:`, err.message);
        }),
      ),
  );
}

/**
 * @param {{ email: string, name?: string }} user
 */
export async function sendPendingUserEmailToAdmins(user) {
  const creds = credentials();
  if (!creds.ready) {
    console.warn("[Notifications] EmailJS not configured — skipping pending-user notify.");
    return;
  }

  const adminEmails = await getAdminEmails();
  if (!adminEmails.length) {
    console.warn("[Notifications] No admin emails found.");
    return;
  }

  const timestamp = formatPortalDateTime();
  const templateParams = {
    actor_name: user.name || user.email,
    action: "attempted to login (access pending approval)",
    item_name: user.email,
    module: "User Access Control",
    timestamp,
    portal_url: creds.portalUrl,
    subject: `[Portal Access Request] New user login attempt: ${user.email}`,
  };

  await Promise.allSettled(
    adminEmails.map((email) =>
      sendOneEmail(email, templateParams).catch((err) => {
        console.warn(`[Notifications] Failed to send to admin ${email}:`, err.message);
      }),
    ),
  );
}

/**
 * @param {string} userEmail
 * @param {string} [_userName]
 */
export async function sendApprovalEmailToUser(userEmail, userName) {
  const creds = credentials();
  if (!creds.ready) {
    console.warn("[Notifications] EmailJS not configured — skipping approval email.");
    return;
  }

  const timestamp = formatPortalDateTime();
  const templateParams = {
    actor_name: "Administrator",
    action: "approved your access request",
    item_name: userEmail,
    module: "User Access Control",
    timestamp,
    portal_url: creds.portalUrl,
    subject: "[Portal Access Approved] You can now log in",
  };

  try {
    await sendOneEmail(userEmail, templateParams);
    console.log(`[Notifications] Approval email sent to ${userEmail}${userName ? ` (${userName})` : ""}.`);
  } catch (err) {
    console.warn(`[Notifications] Failed to send approval email to ${userEmail}:`, err.message);
  }
}

/**
 * @param {{
 *   assigneeName?: string,
 *   assigneeEmail?: string,
 *   actorName: string,
 *   goalType?: string,
 *   periodId?: string,
 *   action?: "assigned" | "updated",
 *   goalItems?: { text?: string }[],
 * }} payload
 */
export async function sendAssigneeGoalEmail(payload) {
  const creds = credentials();
  if (!creds.ready) {
    console.warn("[Notifications] EmailJS not configured — skipping assignee email.");
    return;
  }

  const {
    assigneeName,
    assigneeEmail: providedEmail,
    actorName,
    goalType,
    periodId,
    action = "assigned",
    goalItems = [],
  } = payload;

  const assigneeEmail = providedEmail && String(providedEmail).includes("@")
    ? String(providedEmail).trim()
    : await getEmailForProfileName(String(assigneeName || ""));

  if (!assigneeEmail || !assigneeEmail.includes("@")) {
    console.warn(`[Notifications] No email for assignee "${assigneeName || ""}".`);
    return;
  }

  const actionPhrase = action === "updated" ? "updated a goal assigned to you" : "assigned you a new goal";
  const typeLabel = goalType ? String(goalType) : "goal";
  const period = periodId ? ` (${periodId})` : "";
  const titlePart = `${typeLabel} goals${period}`;
  const timestamp = formatPortalDateTime();

  const itemName = formatAssignedGoalsForEmail(goalItems, `an entry in the ${titlePart}`);

  const templateParams = {
    actor_name: actorName,
    action: actionPhrase,
    item_name: itemName,
    module: "Goals",
    timestamp,
    portal_url: creds.portalUrl,
    subject: `[Portal] ${actorName} ${action === "updated" ? "updated" : "assigned"} a goal to you`,
  };

  try {
    await sendOneEmail(assigneeEmail, templateParams);
  } catch (err) {
    console.warn(`[Notifications] Failed to send assignee email to ${assigneeEmail}:`, err.message);
  }
}

/**
 * @param {{
 *   toEmail: string,
 *   actorName: string,
 *   goalText: string,
 *   customMessage?: string,
 * }} payload
 */
export async function sendGoalReminderEmail(payload) {
  const creds = credentials();
  if (!creds.ready) {
    console.warn("[Notifications] EmailJS not configured — skipping goal reminder email.");
    return;
  }

  const {
    toEmail,
    actorName,
    goalText,
    customMessage = "",
  } = payload;

  const snippet = String(goalText || "your goal").trim().slice(0, 200);
  const message = String(customMessage || "").trim();
  const genericBody = `You have an incomplete goal that needs your attention: "${snippet}". Please log in to the portal and complete it when you are ready.`;
  const timestamp = formatPortalDateTime();

  const templateParams = {
    actor_name: actorName,
    action: message || "reminded you to complete a goal",
    item_name: `"${snippet}"`,
    module: "Goals",
    timestamp,
    portal_url: creds.portalUrl,
    custom_message: message || genericBody,
    subject: message
      ? `[Portal] Goal reminder from ${actorName}`
      : `[Portal] Reminder: complete your goal`,
  };

  try {
    await sendOneEmail(toEmail, templateParams);
  } catch (err) {
    console.warn(`[Notifications] Failed to send goal reminder to ${toEmail}:`, err.message);
  }
}

/**
 * @param {{
 *   toEmail: string,
 *   actorName: string,
 *   action: string,
 *   itemName: string,
 *   module: string,
 *   mandatory?: boolean,
 * }} payload
 */
export async function sendDirectEmail(payload) {
  const creds = credentials();
  if (!creds.ready) {
    console.warn("[Notifications] EmailJS not configured — skipping direct email.");
    return;
  }

  const {
    toEmail,
    actorName,
    action,
    itemName,
    module,
  } = payload;

  const timestamp = formatPortalDateTime();
  const templateParams = {
    actor_name: actorName,
    action,
    item_name: itemName,
    module,
    timestamp,
    portal_url: creds.portalUrl,
    subject: `[Portal] ${actorName} ${action}`,
  };

  try {
    await sendOneEmail(toEmail, templateParams);
  } catch (err) {
    console.warn(`[Notifications] Failed to send direct email to ${toEmail}:`, err.message);
  }
}
