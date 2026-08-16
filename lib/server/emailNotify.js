import { query } from "@/lib/server/db";
import { formatPortalDateTime } from "@/lib/server/realTime";

function credentials() {
  const serviceId = process.env.EMAILJS_SERVICE_ID || process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID || "";
  const templateId = process.env.EMAILJS_TEMPLATE_ID || process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID || "";
  const publicKey = process.env.EMAILJS_PUBLIC_KEY || process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY || "";
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
 * Email admins when an unlisted user tries to log in.
 * @param {{ email: string, name?: string }} user
 */
export async function notifyAdminsOfPendingUser(user) {
  const creds = credentials();
  if (!creds.ready) {
    console.warn("[EmailNotify] EmailJS not configured — skipping pending-user notify.");
    return;
  }

  const adminRes = await query(`SELECT emails FROM role_access WHERE id = 'admins'`);
  const adminEmails = Array.isArray(adminRes.rows[0]?.emails) ? adminRes.rows[0].emails : [];
  if (!adminEmails.length) {
    console.warn("[EmailNotify] No admin emails — skipping pending-user notify.");
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
      sendOneEmail(String(email), templateParams).catch((err) => {
        console.warn(`[EmailNotify] Failed to send to admin ${email}:`, err.message);
      }),
    ),
  );
}
