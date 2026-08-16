'use client';

import { formatPortalDateTime } from "@/lib/portalTime";
import { get } from "./portalApi";

let EMAILJS_SERVICE_ID = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID || "";
let EMAILJS_TEMPLATE_ID = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID || "";
let EMAILJS_PUBLIC_KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY || "";
let PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_URL || "";

let emailNotificationsPaused = false;
let settingsHydrated = false;

/**
 * @param {unknown} data
 * @returns {boolean | null}
 */
export function pausedFromSettings(data) {
    if (Array.isArray(data)) {
        const globalSettings = data.find((s) => s && typeof s === "object" && s.id === "global");
        if (!globalSettings) return null;
        return globalSettings.emailNotificationsPaused === true;
    }
    if (data && typeof data === "object" && "emailNotificationsPaused" in data) {
        return data.emailNotificationsPaused === true;
    }
    return null;
}

export function setEmailNotificationsPaused(paused) {
    emailNotificationsPaused = paused === true;
    settingsHydrated = true;
    return emailNotificationsPaused;
}

export function getEmailNotificationsPaused() {
    return emailNotificationsPaused === true;
}

function credentialsReady() {
    return !!(
        EMAILJS_SERVICE_ID &&
        EMAILJS_TEMPLATE_ID &&
        EMAILJS_PUBLIC_KEY &&
        EMAILJS_SERVICE_ID !== "YOUR_SERVICE_ID" &&
        EMAILJS_TEMPLATE_ID !== "YOUR_TEMPLATE_ID" &&
        EMAILJS_PUBLIC_KEY !== "YOUR_PUBLIC_KEY"
    );
}

async function getAllTeamEmails() {
    try {
        const profiles = await get("profile", { admin: false });
        if (!Array.isArray(profiles)) return [];
        return profiles
            .map((p) => (p.email || "").trim().toLowerCase())
            .filter((e) => e.includes("@"));
    } catch (e) {
        console.warn("[EmailNotify] Could not load team profiles:", e);
        return [];
    }
}

async function sendOneEmail(toEmail, templateParams) {
    const payload = {
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_ID,
        user_id: EMAILJS_PUBLIC_KEY,
        template_params: {
            ...templateParams,
            to_email: toEmail,
        },
    };

    const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`EmailJS responded ${res.status}: ${body}`);
    }
}

async function isEmailNotificationsPaused() {
    if (settingsHydrated) {
        return emailNotificationsPaused === true;
    }
    try {
        const globalPaused = pausedFromSettings(await get("settings", { admin: false }));
        if (globalPaused !== null) {
            setEmailNotificationsPaused(globalPaused);
            return globalPaused;
        }
    } catch (e) {
        console.log("[EmailNotify] Failed to fetch settings, falling back to local storage.");
    }
    return emailNotificationsPaused === true;
}

export async function notifyTeam({ action, actorName, itemName, module, excludeEmail = "" }) {
    const isPaused = await isEmailNotificationsPaused();
    if (isPaused) {
        console.log("[EmailNotify] Email notifications are paused — skipping notification.");
        return;
    }
    if (!credentialsReady()) {
        console.warn("[EmailNotify] EmailJS credentials not configured — skipping notification.");
        return;
    }

    const emails = await getAllTeamEmails();
    if (emails.length === 0) {
        console.warn("[EmailNotify] No team emails found — skipping notification.");
        return;
    }

    const actionVerb = {
        added: "added",
        edited: "edited",
        deleted: "deleted",
    }[action] || action;

    const timestamp = formatPortalDateTime();

    const templateParams = {
        actor_name: actorName,
        action: actionVerb,
        item_name: itemName,
        module,
        timestamp,
        portal_url: PORTAL_URL,
        subject: `[Portal] ${actorName} ${actionVerb} ${module} entry`,
    };

    const sendPromises = emails
        .filter((e) => e.toLowerCase() !== excludeEmail.toLowerCase())
        .map((email) =>
            sendOneEmail(email, templateParams).catch((err) => {
                console.warn(`[EmailNotify] Failed to send to ${email}:`, err.message);
            }),
        );

    await Promise.allSettled(sendPromises);
    console.log(`[EmailNotify] Broadcast complete: "${actorName} ${actionVerb} ${module} — ${itemName}" → ${sendPromises.length} recipient(s).`);
}

export async function notifyAdminsOfNewUser(user) {
    if (!credentialsReady()) {
        console.warn("[EmailNotify] EmailJS credentials not configured — skipping admin notification.");
        return;
    }

    let adminEmails = [];
    try {
        const data = await get("role_access", { admin: false });
        if (Array.isArray(data)) {
            const adminsRec = data.find((r) => r.id === "admins");
            if (adminsRec) {
                adminEmails = adminsRec.emails || [];
            }
        }
    } catch (e) {
        console.warn("[EmailNotify] Failed to fetch admin emails:", e);
    }

    if (adminEmails.length === 0) {
        console.warn("[EmailNotify] No admin emails found in role access — skipping notification.");
        return;
    }

    const timestamp = formatPortalDateTime();

    const templateParams = {
        actor_name: user.displayName || user.email,
        action: "attempted to login (access pending approval)",
        item_name: user.email,
        module: "User Access Control",
        timestamp,
        portal_url: PORTAL_URL,
        subject: `[Portal Access Request] New user login attempt: ${user.email}`,
    };

    const sendPromises = adminEmails.map((email) =>
        sendOneEmail(email, templateParams).catch((err) => {
            console.warn(`[EmailNotify] Failed to send to admin ${email}:`, err.message);
        }),
    );

    await Promise.allSettled(sendPromises);
    console.log(`[EmailNotify] Admin broadcast complete for new user request: ${user.email}`);
}

export async function sendApprovalEmailToUser(userEmail, userName) {
    if (!credentialsReady()) {
        console.warn("[EmailNotify] EmailJS credentials not configured — skipping user approval email.");
        return;
    }

    const timestamp = formatPortalDateTime();

    const templateParams = {
        actor_name: "Administrator",
        action: "approved your access request",
        item_name: userEmail,
        module: "User Access Control",
        timestamp,
        portal_url: PORTAL_URL,
        subject: `[Portal Access Approved] You can now log in`,
    };

    try {
        await sendOneEmail(userEmail, templateParams);
        console.log(`[EmailNotify] Approval email sent to user ${userEmail}`);
    } catch (err) {
        console.warn(`[EmailNotify] Failed to send approval email to ${userEmail}:`, err.message);
    }
}

async function getEmailForProfileName(name) {
    if (!name) return "";
    try {
        const profiles = await get("profile", { admin: false });
        if (!Array.isArray(profiles)) return "";
        const normalized = name.trim().toLowerCase();
        const match = profiles.find((p) => (p.name || "").trim().toLowerCase() === normalized);
        return match ? (match.email || "").trim() : "";
    } catch (e) {
        console.warn("[EmailNotify] Could not resolve assignee email:", e);
        return "";
    }
}

export async function notifyAssigneeOfGoal({
    assigneeName,
    assigneeEmail: providedEmail,
    actorName,
    goalTitle,
    goalType,
    periodId,
    action = "assigned",
}) {
    if (!credentialsReady()) {
        console.warn("[EmailNotify] EmailJS credentials not configured — skipping assignee notification.");
        return;
    }

    const assigneeEmail = providedEmail && String(providedEmail).includes("@")
        ? String(providedEmail).trim()
        : await getEmailForProfileName(assigneeName);
    if (!assigneeEmail || !assigneeEmail.includes("@")) {
        console.warn(`[EmailNotify] No email found for assignee "${assigneeName}" — skipping mandatory assign notification.`);
        return;
    }

    const actionPhrase = action === "updated" ? "updated a goal assigned to you" : "assigned you a new goal";
    const typeLabel = goalType ? String(goalType) : "goal";
    const period = periodId ? ` (${periodId})` : "";
    const titlePart = `${typeLabel} goals${period}`;

    const timestamp = formatPortalDateTime();

    const templateParams = {
        actor_name: actorName,
        action: actionPhrase,
        item_name: titlePart,
        module: "Goals",
        timestamp,
        portal_url: PORTAL_URL,
        subject: `[Portal] ${actorName} ${action === "updated" ? "updated" : "assigned"} a goal to you`,
    };

    try {
        await sendOneEmail(assigneeEmail, templateParams);
        console.log(`[EmailNotify] Mandatory assignee notification sent to ${assigneeEmail} for goal "${titlePart}".`);
    } catch (err) {
        console.warn(`[EmailNotify] Failed to send mandatory assignee notification to ${assigneeEmail}:`, err.message);
    }
}
