/**
 * /email-notify.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared team-notification utility for HackstreetBoys Internal Portal.
 */

// ─── ✏️  CONFIGURE YOUR EMAILJS CREDENTIALS HERE ────────────────────────────
let EMAILJS_SERVICE_ID = '';
let EMAILJS_TEMPLATE_ID = '';
let EMAILJS_PUBLIC_KEY = '';
let PORTAL_URL = '';
// ─────────────────────────────────────────────────────────────────────────────

let envLoaded = false;
async function _ensureEnv() {
    if (envLoaded) return;
    if (window.ENV) {
        if (window.ENV.EMAILJS_SERVICE_ID) EMAILJS_SERVICE_ID = window.ENV.EMAILJS_SERVICE_ID;
        if (window.ENV.EMAILJS_TEMPLATE_ID) EMAILJS_TEMPLATE_ID = window.ENV.EMAILJS_TEMPLATE_ID;
        if (window.ENV.EMAILJS_PUBLIC_KEY) EMAILJS_PUBLIC_KEY = window.ENV.EMAILJS_PUBLIC_KEY;
        if (window.ENV.PORTAL_URL) PORTAL_URL = window.ENV.PORTAL_URL;
        envLoaded = true;
        return;
    }
    try {
        console.warn('[EmailNotify] window.ENV not available — credentials may not be loaded yet.');
    } catch (e) { }
    envLoaded = true;
}

/**
 * Collects all team member emails from the profile store.
 * Returns an array of email strings (never null/undefined).
 */
async function _getAllTeamEmails() {
    try {
        const res = await fetch('/api/profile');
        if (!res.ok) return [];
        const profiles = await res.json();
        if (!Array.isArray(profiles)) return [];
        return profiles
            .map(p => (p.email || '').trim().toLowerCase())
            .filter(e => e.includes('@'));
    } catch (e) {
        console.warn('[EmailNotify] Could not load team profiles:', e);
        return [];
    }
}

/**
 * Sends a single email via EmailJS REST API (no SDK needed).
 */
async function _sendOneEmail(toEmail, templateParams) {
    const payload = {
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_ID,
        user_id: EMAILJS_PUBLIC_KEY,
        template_params: {
            ...templateParams,
            to_email: toEmail
        }
    };

    const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`EmailJS responded ${res.status}: ${body}`);
    }
}

/**
 * Check if notifications are globally paused on the server, fallback to local configuration.
 */
async function _isEmailNotificationsPaused() {
    console.log('[EmailNotify] Checking notification pause status...');
    try {
        const res = await fetch('/api/settings');
        if (res.ok) {
            const data = await res.json();
            console.log('[EmailNotify] Settings fetched:', data);

            let globalPaused = null;
            if (Array.isArray(data)) {
                const globalSettings = data.find(s => s.id === 'global');
                if (globalSettings) {
                    globalPaused = globalSettings.emailNotificationsPaused === true;
                }
            } else if (data && typeof data === 'object') {
                globalPaused = data.emailNotificationsPaused === true;
            }

            if (globalPaused !== null) {
                console.log('[EmailNotify] Syncing notification status from server settings:', globalPaused);
                if (window.top) window.top.emailNotificationsPaused = globalPaused;
                return globalPaused;
            }
        } else {
            console.log('[EmailNotify] Settings API offline (Static Mode). Falling back to local storage.');
        }
    } catch (e) {
        console.log('[EmailNotify] Failed to fetch settings, falling back to local storage.');
    }

    const localState = window.top ? window.top.emailNotificationsPaused === true : false;
    console.log('[EmailNotify] Using local configuration state:', localState);
    return localState;
}

window.notifyTeam = async function ({ action, actorName, itemName, module, excludeEmail = '' }) {
    const isPaused = await _isEmailNotificationsPaused();
    if (isPaused) {
        console.log('[EmailNotify] Email notifications are paused — skipping notification.');
        return;
    }
    await _ensureEnv();
    if (
        !EMAILJS_SERVICE_ID ||
        !EMAILJS_TEMPLATE_ID ||
        !EMAILJS_PUBLIC_KEY ||
        EMAILJS_SERVICE_ID === 'YOUR_SERVICE_ID' ||
        EMAILJS_TEMPLATE_ID === 'YOUR_TEMPLATE_ID' ||
        EMAILJS_PUBLIC_KEY === 'YOUR_PUBLIC_KEY'
    ) {
        console.warn('[EmailNotify] EmailJS credentials not configured — skipping notification.');
        return;
    }

    // Fetch recipient list
    const emails = await _getAllTeamEmails();
    if (emails.length === 0) {
        console.warn('[EmailNotify] No team emails found — skipping notification.');
        return;
    }

    const actionVerb = {
        added: 'added',
        edited: 'edited',
        deleted: 'deleted'
    }[action] || action;

    const timestamp = new Date().toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short'
    });

    const templateParams = {
        actor_name: actorName,
        action: actionVerb,
        item_name: itemName,
        module,
        timestamp,
        portal_url: PORTAL_URL,
        subject: `[Portal] ${actorName} ${actionVerb} ${module} entry`
    };

    // Fan out — fire all sends concurrently; failures are non-fatal
    const sendPromises = emails
        .filter(e => e.toLowerCase() !== excludeEmail.toLowerCase())
        .map(email =>
            _sendOneEmail(email, templateParams).catch(err => {
                console.warn(`[EmailNotify] Failed to send to ${email}:`, err.message);
            })
        );

    await Promise.allSettled(sendPromises);
    console.log(`[EmailNotify] Broadcast complete: "${actorName} ${actionVerb} ${module} — ${itemName}" → ${sendPromises.length} recipient(s).`);
};

/**
 * Sends a notification to all admins in the role-access configuration when a new user tries to log in.
 * Bypasses global pause settings.
 */
window.notifyAdminsOfNewUser = async function (user) {
    await _ensureEnv();
    if (
        !EMAILJS_SERVICE_ID ||
        !EMAILJS_TEMPLATE_ID ||
        !EMAILJS_PUBLIC_KEY ||
        EMAILJS_SERVICE_ID === 'YOUR_SERVICE_ID' ||
        EMAILJS_TEMPLATE_ID === 'YOUR_TEMPLATE_ID' ||
        EMAILJS_PUBLIC_KEY === 'YOUR_PUBLIC_KEY'
    ) {
        console.warn('[EmailNotify] EmailJS credentials not configured — skipping admin notification.');
        return;
    }

    let adminEmails = [];
    try {
        const res = await fetch('/api/role_access');
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data)) {
                const adminsRec = data.find(r => r.id === 'admins');
                if (adminsRec) {
                    adminEmails = adminsRec.emails || [];
                }
            }
        }
    } catch (e) {
        console.warn('[EmailNotify] Failed to fetch admin emails:', e);
    }

    if (adminEmails.length === 0) {
        console.warn('[EmailNotify] No admin emails found in role access — skipping notification.');
        return;
    }

    const timestamp = new Date().toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short'
    });

    const templateParams = {
        actor_name: user.displayName || user.email,
        action: 'attempted to login (access pending approval)',
        item_name: user.email,
        module: 'User Access Control',
        timestamp,
        portal_url: PORTAL_URL,
        subject: `[Portal Access Request] New user login attempt: ${user.email}`
    };

    const sendPromises = adminEmails.map(email =>
        _sendOneEmail(email, templateParams).catch(err => {
            console.warn(`[EmailNotify] Failed to send to admin ${email}:`, err.message);
        })
    );

    await Promise.allSettled(sendPromises);
    console.log(`[EmailNotify] Admin broadcast complete for new user request: ${user.email}`);
};

/**
 * Sends an email directly to the user once their access request has been approved.
 * Bypasses global pause settings.
 */
window.sendApprovalEmailToUser = async function (userEmail, userName) {
    await _ensureEnv();
    if (
        !EMAILJS_SERVICE_ID ||
        !EMAILJS_TEMPLATE_ID ||
        !EMAILJS_PUBLIC_KEY ||
        EMAILJS_SERVICE_ID === 'YOUR_SERVICE_ID' ||
        EMAILJS_TEMPLATE_ID === 'YOUR_TEMPLATE_ID' ||
        EMAILJS_PUBLIC_KEY === 'YOUR_PUBLIC_KEY'
    ) {
        console.warn('[EmailNotify] EmailJS credentials not configured — skipping user approval email.');
        return;
    }

    const timestamp = new Date().toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short'
    });

    const templateParams = {
        actor_name: 'Administrator',
        action: 'approved your access request',
        item_name: userEmail,
        module: 'User Access Control',
        timestamp,
        portal_url: PORTAL_URL,
        subject: `[Portal Access Approved] You can now log in`
    };

    try {
        await _sendOneEmail(userEmail, templateParams);
        console.log(`[EmailNotify] Approval email sent to user ${userEmail}`);
    } catch (err) {
        console.warn(`[EmailNotify] Failed to send approval email to ${userEmail}:`, err.message);
    }
};

/**
 * Resolves a profile display name to an email address.
 */
async function _getEmailForProfileName(name) {
    if (!name) return '';
    try {
        const res = await fetch('/api/profile');
        if (!res.ok) return '';
        const profiles = await res.json();
        if (!Array.isArray(profiles)) return '';
        const normalized = name.trim().toLowerCase();
        const match = profiles.find(p => (p.name || '').trim().toLowerCase() === normalized);
        return match ? (match.email || '').trim() : '';
    } catch (e) {
        console.warn('[EmailNotify] Could not resolve assignee email:', e);
        return '';
    }
}

/**
 * Mandatory email to the person a goal was assigned to. Bypasses global pause settings.
 */
window.notifyAssigneeOfGoal = async function ({
    assigneeName,
    assigneeEmail: providedEmail,
    actorName,
    goalTitle,
    goalType,
    periodId,
    action = 'assigned'
}) {
    await _ensureEnv();
    if (
        !EMAILJS_SERVICE_ID ||
        !EMAILJS_TEMPLATE_ID ||
        !EMAILJS_PUBLIC_KEY ||
        EMAILJS_SERVICE_ID === 'YOUR_SERVICE_ID' ||
        EMAILJS_TEMPLATE_ID === 'YOUR_TEMPLATE_ID' ||
        EMAILJS_PUBLIC_KEY === 'YOUR_PUBLIC_KEY'
    ) {
        console.warn('[EmailNotify] EmailJS credentials not configured — skipping assignee notification.');
        return;
    }

    const assigneeEmail = (providedEmail && String(providedEmail).includes('@'))
        ? String(providedEmail).trim()
        : await _getEmailForProfileName(assigneeName);
    if (!assigneeEmail || !assigneeEmail.includes('@')) {
        console.warn(`[EmailNotify] No email found for assignee "${assigneeName}" — skipping mandatory assign notification.`);
        return;
    }

    const actionPhrase = action === 'updated' ? 'updated a goal assigned to you' : 'assigned you a new goal';
    const typeLabel = goalType ? String(goalType) : 'goal';
    const period = periodId ? ` (${periodId})` : '';
    const titlePart = `${typeLabel} goals${period}`;

    const timestamp = new Date().toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short'
    });

    const templateParams = {
        actor_name: actorName,
        action: actionPhrase,
        item_name: titlePart,
        module: 'Goals',
        timestamp,
        portal_url: PORTAL_URL,
        subject: `[Portal] ${actorName} ${action === 'updated' ? 'updated' : 'assigned'} a goal to you`
    };

    try {
        await _sendOneEmail(assigneeEmail, templateParams);
        console.log(`[EmailNotify] Mandatory assignee notification sent to ${assigneeEmail} for goal "${titlePart}".`);
    } catch (err) {
        console.warn(`[EmailNotify] Failed to send mandatory assignee notification to ${assigneeEmail}:`, err.message);
    }
};

/**
 * Convenience helper: get the logged-in user's name and email from session.
 */
window.getSessionActor = function () {
    try {
        const session = window.top ? window.top.sessionUser : null;
        if (session && session.name) {
            return { name: session.name, email: session.email || '' };
        }
    } catch (_) { }
    return { name: 'A Team Member', email: '' };
};